import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { RecordingInsert } from "@/types/database";

// Allow up to 10 minutes for large file uploads
export const maxDuration = 600;

// Development organization UUID for anonymous uploads
const DEV_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

const ALLOWED_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "video/webm",
];

// Normalize browser MIME types to types accepted by Supabase Storage bucket
const CONTENT_TYPE_MAP: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "video/webm": "audio/webm",
};

function normalizeContentType(contentType: string): string {
  return CONTENT_TYPE_MAP[contentType] || contentType;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Missing file in form data" },
        { status: 400 }
      );
    }

    const fileName = file.name;
    const fileSize = file.size;
    const contentType = file.type;

    // Validate content type
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "Invalid content type. Allowed: MP3, WAV, M4A, WEBM, OGG" },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500 MB" },
        { status: 400 }
      );
    }

    // Generate unique file path (ASCII-only)
    const recordingId = randomUUID();
    const fileExt = fileName.includes(".") ? fileName.split(".").pop() : "bin";
    const storagePath = `${DEV_ORGANIZATION_ID}/${recordingId}/audio.${fileExt}`;

    const adminClient = createAdminClient();

    // Create recording in database with 'uploading' status
    const { error: dbError } = await adminClient.from("recordings").insert({
      id: recordingId,
      organization_id: DEV_ORGANIZATION_ID,
      user_id: user?.id || null,
      title: title || fileName.replace(/\.[^/.]+$/, ""),
      storage_path: storagePath,
      file_name: fileName,
      file_size: fileSize,
      duration_seconds: null,
      status: "uploading",
      error_message: null,
    } as RecordingInsert);

    if (dbError) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        { error: "Failed to create recording record" },
        { status: 500 }
      );
    }

    // Upload file to Supabase Storage server-side (bypasses CORS)
    const storageContentType = normalizeContentType(contentType);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from("audio-files")
      .upload(storagePath, buffer, {
        contentType: storageContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      // Clean up the DB record on upload failure
      await adminClient.from("recordings").delete().eq("id", recordingId);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ recordingId });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
