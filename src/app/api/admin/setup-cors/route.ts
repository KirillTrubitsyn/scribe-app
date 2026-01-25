import { NextResponse } from "next/server";
import { getStorageClient } from "@/lib/google/storage";
import { getBucketName } from "@/lib/google/credentials";

// One-time setup endpoint to configure CORS on GCS bucket
// Call this once: POST /api/admin/setup-cors

export async function POST() {
  try {
    const storage = getStorageClient();
    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);

    // Configure CORS for browser uploads
    await bucket.setCorsConfiguration([
      {
        origin: ["*"],
        method: ["PUT", "GET", "HEAD", "OPTIONS"],
        responseHeader: ["Content-Type", "Content-Length", "Content-Range"],
        maxAgeSeconds: 3600,
      },
    ]);

    return NextResponse.json({
      success: true,
      message: `CORS configured for bucket: ${bucketName}`,
    });
  } catch (error) {
    console.error("CORS setup error:", error);
    return NextResponse.json(
      {
        error: "Failed to configure CORS",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const storage = getStorageClient();
    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);

    const [metadata] = await bucket.getMetadata();

    return NextResponse.json({
      bucket: bucketName,
      cors: metadata.cors || null,
    });
  } catch (error) {
    console.error("CORS check error:", error);
    return NextResponse.json(
      { error: "Failed to get CORS configuration" },
      { status: 500 }
    );
  }
}
