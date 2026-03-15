import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateQueryEmbedding } from "@/lib/embeddings";

export const maxDuration = 30;

interface SearchRequest {
  query: string;
  recording_id?: string;
  limit?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchRequest;
    const { query, recording_id, limit = 10 } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // Generate embedding for search query
    const queryEmbedding = await generateQueryEmbedding(query.trim());

    // Search for similar chunks using pgvector
    const supabase = createAdminClient();

    const { data: chunks, error } = await supabase.rpc("match_chunks", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_threshold: 0.3,
      match_count: limit,
      filter_recording_id: recording_id || null,
    });

    if (error) {
      console.error("[Search] RPC error:", error);
      return NextResponse.json(
        { error: "Search failed" },
        { status: 500 }
      );
    }

    // Enrich results with recording titles
    const recordingIds = [...new Set((chunks || []).map((c: { recording_id: string }) => c.recording_id))];

    let recordings: Record<string, { title: string; created_at: string }> = {};
    if (recordingIds.length > 0) {
      const { data: recs } = await supabase
        .from("recordings")
        .select("id, title, created_at")
        .in("id", recordingIds);

      if (recs) {
        recordings = Object.fromEntries(
          recs.map((r: { id: string; title: string; created_at: string }) => [r.id, { title: r.title, created_at: r.created_at }])
        );
      }
    }

    const results = (chunks || []).map((chunk: {
      id: string;
      recording_id: string;
      chunk_index: number;
      text: string;
      start_time: number | null;
      end_time: number | null;
      speaker: string | null;
      similarity: number;
    }) => ({
      ...chunk,
      recording_title: recordings[chunk.recording_id]?.title || "Без названия",
      recording_date: recordings[chunk.recording_id]?.created_at || null,
    }));

    return NextResponse.json({ results, query: query.trim() });
  } catch (error) {
    console.error("[Search] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
