import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getSignedUploadUrl } from "@/lib/supabase/storage";
import type { RecordingInsert } from "@/types/database";

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

interface UploadRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
  title: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check authentication (optional for now, can be enforced later)
    const { data: { user } } = await supabase.auth.getUser();

    // Parse request body
    const body: UploadRequest = await request.json();
    const { fileName, fileSize, contentType, title } = body;

    // Validate required fields
    if (!fileName || !fileSize || !contentType) {
      return NextResponse.json(
        { error: "Missing required fields: fileName, fileSize, contentType" },
        { status: 400 }
      );
    }

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

    // Generate unique file path for Supabase Storage
    const recordingId = randomUUID();
    const storagePath = `${DEV_ORGANIZATION_ID}/${recordingId}/${fileName}`;

    // Use admin client for database operations to bypass RLS
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

    // Generate signed URL for direct upload to Supabase Storage
    const uploadUrl = await getSignedUploadUrl(storagePath);

    // Return normalized content type so client sends a type the bucket accepts
    const storageContentType = normalizeContentType(contentType);

    return NextResponse.json({
      recordingId,
      uploadUrl,
      contentType: storageContentType,
    });
  } catch (error) {
    console.error("Upload init error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
