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

    // Request a signed token from ElevenLabs for client-side WebSocket auth
    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text/get-websocket-token",
      {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[STT Token] ElevenLabs token request failed:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to generate STT token" },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json({ token: data.token });
  } catch (error) {
    console.error("[STT Token] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
