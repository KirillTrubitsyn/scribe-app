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
      .select("id, gcs_uri, file_name, title")
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

    // Generate signed URL for download
    const signedUrl = await generateDownloadSignedUrl(recording.gcs_uri);

    return NextResponse.json({
      url: signedUrl,
      fileName: recording.file_name || `${recording.title}.audio`,
    });
  } catch (error) {
    console.error("Error generating download URL:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
