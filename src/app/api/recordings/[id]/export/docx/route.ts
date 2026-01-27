import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateRecordingDocx,
  generateTranscriptDocx,
  generateSummaryDocx,
  generateProtocolDocx,
  generateDocxFilename,
} from "@/lib/docx/generator";
import type { Recording, Transcript, Artifact, Speaker } from "@/types/database";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const docType = searchParams.get("type") || "all"; // all, transcript, summary, protocol

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Fetch recording
    const { data: recordingData, error: recordingError } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", id)
      .single();

    if (recordingError || !recordingData) {
      console.error("[DOCX Export] Recording not found:", recordingError);
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    const recording = recordingData as Recording;

    // Fetch related data
    const [transcriptsResult, artifactsResult, speakersResult] = await Promise.all([
      supabase.from("transcripts").select("*").eq("recording_id", id),
      supabase.from("artifacts").select("*").eq("recording_id", id),
      supabase.from("speakers").select("*").eq("recording_id", id).order("speaker_index"),
    ]);

    const transcript = (transcriptsResult.data?.[0] ?? null) as Transcript | null;
    const artifacts = (artifactsResult.data ?? []) as Artifact[];
    const speakers = (speakersResult.data ?? []) as Speaker[];

    let buffer: Buffer;
    let filename: string;

    switch (docType) {
      case "transcript":
        if (!transcript) {
          return NextResponse.json(
            { error: "Transcript not ready yet" },
            { status: 400 }
          );
        }
        console.log("[DOCX Export] Generating transcript document for recording:", id);
        buffer = await generateTranscriptDocx(recording, transcript, speakers);
        filename = generateDocxFilename(recording, "transcript");
        break;

      case "summary":
        const summaryArtifact = artifacts.find(a => a.type === "summary");
        if (!summaryArtifact) {
          return NextResponse.json(
            { error: "Summary not available" },
            { status: 400 }
          );
        }
        console.log("[DOCX Export] Generating summary document for recording:", id);
        buffer = await generateSummaryDocx(recording, summaryArtifact.content);
        filename = generateDocxFilename(recording, "summary");
        break;

      case "protocol":
        const protocolArtifact = artifacts.find(a => a.type === "protocol");
        if (!protocolArtifact) {
          return NextResponse.json(
            { error: "Protocol not available" },
            { status: 400 }
          );
        }
        console.log("[DOCX Export] Generating protocol document for recording:", id);
        buffer = await generateProtocolDocx(recording, protocolArtifact.content);
        filename = generateDocxFilename(recording, "protocol");
        break;

      case "all":
      default:
        if (!transcript) {
          return NextResponse.json(
            { error: "Transcript not ready yet" },
            { status: 400 }
          );
        }
        console.log("[DOCX Export] Generating full document for recording:", id);
        buffer = await generateRecordingDocx(recording, transcript, artifacts, speakers);
        filename = generateDocxFilename(recording);
        break;
    }

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[DOCX Export] Error generating document:", error);
    return NextResponse.json(
      { error: "Failed to generate document" },
      { status: 500 }
    );
  }
}

// POST endpoint for exporting with edited content
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { type, content } = body as { type: string; content: string };

    if (!type || !content) {
      return NextResponse.json(
        { error: "Missing type or content" },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Fetch recording
    const { data: recordingData, error: recordingError } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", id)
      .single();

    if (recordingError || !recordingData) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    const recording = recordingData as Recording;

    let buffer: Buffer;
    let filename: string;

    switch (type) {
      case "transcript":
        // For transcript, we need to fetch speakers
        const { data: speakersData } = await supabase
          .from("speakers")
          .select("*")
          .eq("recording_id", id)
          .order("speaker_index");

        const { data: transcriptData } = await supabase
          .from("transcripts")
          .select("*")
          .eq("recording_id", id)
          .single();

        const speakers = (speakersData ?? []) as Speaker[];
        const transcript = transcriptData as Transcript;

        if (!transcript) {
          return NextResponse.json(
            { error: "Transcript not found" },
            { status: 400 }
          );
        }

        console.log("[DOCX Export] Generating edited transcript document");
        buffer = await generateTranscriptDocx(recording, transcript, speakers, content);
        filename = generateDocxFilename(recording, "transcript");
        break;

      case "summary":
        console.log("[DOCX Export] Generating edited summary document");
        buffer = await generateSummaryDocx(recording, content);
        filename = generateDocxFilename(recording, "summary");
        break;

      case "protocol":
        console.log("[DOCX Export] Generating edited protocol document");
        buffer = await generateProtocolDocx(recording, content);
        filename = generateDocxFilename(recording, "protocol");
        break;

      default:
        return NextResponse.json(
          { error: "Invalid document type" },
          { status: 400 }
        );
    }

    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[DOCX Export] Error generating document:", error);
    return NextResponse.json(
      { error: "Failed to generate document" },
      { status: 500 }
    );
  }
}
