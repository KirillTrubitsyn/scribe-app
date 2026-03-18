import { NextResponse } from "next/server";

export async function POST() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    // Generate a signed WebSocket URL server-side to avoid exposing the API key client-side
    // ElevenLabs Scribe realtime WebSocket accepts xi-api-key as a query parameter
    const wsUrl = new URL("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
    wsUrl.searchParams.set("model_id", "scribe_v2_realtime");
    wsUrl.searchParams.set("language_code", "rus");
    wsUrl.searchParams.set("xi-api-key", apiKey);
    wsUrl.searchParams.set("commit_strategy", "vad");
    wsUrl.searchParams.set("vad_silence_threshold_secs", "1.5");
    wsUrl.searchParams.set("include_timestamps", "true");

    return NextResponse.json({ signedUrl: wsUrl.toString() });
  } catch (error) {
    console.error("[STT Token] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
