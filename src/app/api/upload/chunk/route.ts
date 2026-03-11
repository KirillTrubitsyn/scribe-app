import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { RecordingStatus, Recording } from "@/types/database";

// Allow up to 2 minutes per chunk upload
export const maxDuration = 120;

const DEV_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

const ALLOWED_CONTENT_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/webm",
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File | null;
    const recordingId = formData.get("recordingId") as string | null;
    const chunkIndex = formData.get("chunkIndex") as string | null;
    const finalize = formData.get("finalize") as string | null;

    if (!audio || !recordingId || chunkIndex === null) {
      return NextResponse.json(
        { error: "Missing required fields: audio, recordingId, chunkIndex" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Verify recording exists
    const { data: recording, error: fetchError } = await adminClient
      .from("recordings")
      .select("*")
      .eq("id", recordingId)
      .single<Recording>();

    if (fetchError || !recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    // Upload chunk to Supabase Storage
    const chunkPath = `${DEV_ORGANIZATION_ID}/${recordingId}/chunks/chunk-${chunkIndex.padStart(5, "0")}.webm`;
    const contentType = ALLOWED_CONTENT_TYPES.includes(audio.type)
      ? audio.type
      : "audio/webm";

    const buffer = Buffer.from(await audio.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from("audio-files")
      .upload(chunkPath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Chunk Upload] Storage error:", uploadError);
      return NextResponse.json(
        { error: `Failed to upload chunk: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Update file_size incrementally
    await adminClient
      .from("recordings")
      .update({
        file_size: recording.file_size + buffer.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingId);

    // If this is the final chunk, update status and trigger concatenation + processing
    if (finalize === "true") {
      await finalizeRecording(adminClient, recording, parseInt(chunkIndex) + 1);
    }

    return NextResponse.json({
      success: true,
      chunkIndex: parseInt(chunkIndex),
      size: buffer.length,
    });
  } catch (error) {
    console.error("[Chunk Upload] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function finalizeRecording(
  supabase: ReturnType<typeof createAdminClient>,
  recording: Recording,
  totalChunks: number
) {
  try {
    // List all chunks and concatenate them into a single file
    const chunksPrefix = `${DEV_ORGANIZATION_ID}/${recording.id}/chunks/`;

    const { data: chunkFiles, error: listError } = await supabase.storage
      .from("audio-files")
      .list(chunksPrefix, { sortBy: { column: "name", order: "asc" } });

    if (listError || !chunkFiles || chunkFiles.length === 0) {
      console.error("[Finalize] Failed to list chunks:", listError);
      await supabase
        .from("recordings")
        .update({
          status: "error" as RecordingStatus,
          error_message: "Не удалось собрать аудиофайл из чанков.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", recording.id);
      return;
    }

    // Download and concatenate all chunks
    const buffers: Buffer[] = [];
    let totalSize = 0;

    for (const chunk of chunkFiles) {
      const { data, error } = await supabase.storage
        .from("audio-files")
        .download(`${chunksPrefix}${chunk.name}`);

      if (error || !data) {
        console.error(`[Finalize] Failed to download chunk ${chunk.name}:`, error);
        continue;
      }

      const buf = Buffer.from(await data.arrayBuffer());
      buffers.push(buf);
      totalSize += buf.length;
    }

    // Concatenate all chunks into one file
    const fullAudio = Buffer.concat(buffers, totalSize);

    // Upload the concatenated file
    const { error: uploadError } = await supabase.storage
      .from("audio-files")
      .upload(recording.storage_path, fullAudio, {
        contentType: "audio/webm",
        upsert: true,
      });

    if (uploadError) {
      console.error("[Finalize] Failed to upload concatenated file:", uploadError);
      await supabase
        .from("recordings")
        .update({
          status: "error" as RecordingStatus,
          error_message: "Не удалось собрать финальный аудиофайл.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", recording.id);
      return;
    }

    // Update recording status and file size
    await supabase
      .from("recordings")
      .update({
        status: "uploaded" as RecordingStatus,
        file_size: totalSize,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    // Clean up chunks
    const chunkPaths = chunkFiles.map((f: { name: string }) => `${chunksPrefix}${f.name}`);
    await supabase.storage.from("audio-files").remove(chunkPaths);

    // Trigger processing (same as complete route)
    await triggerProcessing(supabase, recording);
  } catch (error) {
    console.error("[Finalize] Error:", error);
    await supabase
      .from("recordings")
      .update({
        status: "error" as RecordingStatus,
        error_message: "Произошла ошибка при финализации записи.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);
  }
}

async function triggerProcessing(
  supabase: ReturnType<typeof createAdminClient>,
  recording: Recording
) {
  const railwayWorkerUrl = process.env.RAILWAY_WEBHOOK_URL;
  const railwaySecret = process.env.RAILWAY_WEBHOOK_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!railwayWorkerUrl || !railwaySecret) {
    console.warn("[Finalize] Railway worker not configured");
    return;
  }

  try {
    await supabase
      .from("recordings")
      .update({
        status: "processing" as RecordingStatus,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    await fetch(railwayWorkerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${railwaySecret}`,
      },
      body: JSON.stringify({
        recording_id: recording.id,
        storage_path: recording.storage_path,
        organization_id: recording.organization_id,
        callback_url: `${appUrl}/api/webhook`,
        file_name: recording.file_name,
        file_size: recording.file_size,
      }),
    });
  } catch (error) {
    console.error("[Finalize] Failed to trigger processing:", error);
    await supabase
      .from("recordings")
      .update({
        status: "error" as RecordingStatus,
        error_message: "Не удалось запустить обработку.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);
  }
}
