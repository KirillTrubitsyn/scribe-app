import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getStorageClient } from "@/lib/google/storage";
import { getBucketName } from "@/lib/google/credentials";

const ALLOWED_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
];

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

    // Generate unique file path
    const recordingId = randomUUID();
    const fileExtension = fileName.split(".").pop() || "mp3";
    const gcsFileName = `recordings/${recordingId}/${fileName}`;
    const gcsUri = `gs://${getBucketName()}/${gcsFileName}`;

    // Create recording in database with 'uploading' status
    const { error: dbError } = await supabase.from("recordings").insert({
      id: recordingId,
      organization_id: user?.id || "anonymous", // Use user ID or anonymous
      user_id: user?.id || "anonymous",
      title: title || fileName.replace(/\.[^/.]+$/, ""), // Remove extension if no title
      gcs_uri: gcsUri,
      file_name: fileName,
      file_size: fileSize,
      status: "uploading",
    });

    if (dbError) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        { error: "Failed to create recording record" },
        { status: 500 }
      );
    }

    // Generate signed URL for direct upload to GCS
    const storage = getStorageClient();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(gcsFileName);

    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType,
    });

    return NextResponse.json({
      recordingId,
      uploadUrl,
    });
  } catch (error) {
    console.error("Upload init error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
