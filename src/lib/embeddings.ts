import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-exp-03-07";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Generate embedding for a search query using Gemini.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const client = getGeminiClient();

  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: "SEMANTIC_SIMILARITY",
    },
  });

  if (!response.embeddings || response.embeddings.length === 0) {
    throw new Error("Failed to generate query embedding");
  }

  return response.embeddings[0].values || [];
}
