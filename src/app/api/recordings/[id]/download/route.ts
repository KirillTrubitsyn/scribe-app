import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedDownloadUrl } from "@/lib/supabase/storage";

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
      .select("id, storage_path, file_name, title")
      .eq("id", id)
      .single();

    if (error || !recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    if (!recording.storage_path) {
      return NextResponse.json(
        { error: "Recording file not available" },
        { status: 404 }
      );
    }

    // Generate signed URL for download
    const signedUrl = await getSignedDownloadUrl(recording.storage_path);

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
