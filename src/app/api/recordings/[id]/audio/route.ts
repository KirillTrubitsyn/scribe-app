import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDownloadSignedUrl } from "@/lib/google/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Get the recording from database
    const { data: recording, error } = await supabase
      .from("recordings")
      .select("id, gcs_uri, file_name, title, status")
      .eq("id", id)
      .single();

    if (error || !recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    if (!recording.gcs_uri) {
      return NextResponse.json(
        { error: "Recording file not available" },
        { status: 404 }
      );
    }

    // Check if recording is still uploading
    if (recording.status === "uploading") {
      return NextResponse.json(
        { error: "Recording is still uploading" },
        { status: 400 }
      );
    }

    // Generate signed URL for streaming
    const signedUrl = await generateDownloadSignedUrl(recording.gcs_uri);

    return NextResponse.json({
      url: signedUrl,
      fileName: recording.file_name,
      title: recording.title,
    });
  } catch (error) {
    console.error("Error generating audio URL:", error);
    return NextResponse.json(
      { error: "Failed to generate audio URL" },
      { status: 500 }
    );
  }
}
