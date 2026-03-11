import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { RecordingInsert } from "@/types/database";

const DEV_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { title, mimeType } = body as { title?: string; mimeType?: string };

    const recordingId = randomUUID();
    const fileExt = mimeType?.includes("mp4") ? "m4a" : "webm";
    const storagePath = `${DEV_ORGANIZATION_ID}/${recordingId}/audio.${fileExt}`;

    const adminClient = createAdminClient();

    const { error: dbError } = await adminClient.from("recordings").insert({
      id: recordingId,
      organization_id: DEV_ORGANIZATION_ID,
      user_id: user?.id || null,
      title: title || `Запись ${new Date().toLocaleDateString("ru-RU")}`,
      storage_path: storagePath,
      file_name: `recording-${recordingId}.${fileExt}`,
      file_size: 0,
      duration_seconds: null,
      status: "recording",
      error_message: null,
    } as RecordingInsert);

    if (dbError) {
      console.error("[Upload Init] Database error:", dbError);
      return NextResponse.json(
        { error: "Failed to create recording" },
        { status: 500 }
      );
    }

    return NextResponse.json({ recordingId, storagePath });
  } catch (error) {
    console.error("[Upload Init] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
