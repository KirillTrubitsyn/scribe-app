import { GoogleGenAI } from '@google/genai'
import { getSupabaseClient } from './supabase.js'
import type { TranscriptSegment } from './supabase.js'

// ============================================
// Constants
// ============================================

const EMBEDDING_MODEL = 'gemini-embedding-exp-03-07'
const CHUNK_TARGET_WORDS = 300
const CHUNK_OVERLAP_WORDS = 50
const MAX_BATCH_SIZE = 100 // Gemini batch embedding limit

// ============================================
// Types
// ============================================

export interface TranscriptChunk {
  chunk_index: number
  text: string
  start_time: number | null
  end_time: number | null
  speaker: string | null
}

// ============================================
// Chunk Splitting
// ============================================

/**
 * Split transcript segments into semantic chunks of ~300 words.
 * Respects speaker boundaries and sentence endings.
 */
export function splitTranscriptIntoChunks(
  segments: TranscriptSegment[],
  targetWords: number = CHUNK_TARGET_WORDS,
  overlapWords: number = CHUNK_OVERLAP_WORDS
): TranscriptChunk[] {
  if (!segments || segments.length === 0) return []

  const chunks: TranscriptChunk[] = []
  let currentText = ''
  let currentWords = 0
  let currentStartTime: number | null = null
  let currentEndTime: number | null = null
  let currentSpeaker: string | null = null
  let chunkIndex = 0

  // Track overlap text from end of previous chunk
  let overlapText = ''

  for (const segment of segments) {
    const segmentWords = segment.text.trim().split(/\s+/).length

    // Start a new chunk if adding this segment exceeds target and we have content
    if (currentWords > 0 && currentWords + segmentWords > targetWords) {
      // Save current chunk
      chunks.push({
        chunk_index: chunkIndex,
        text: currentText.trim(),
        start_time: currentStartTime,
        end_time: currentEndTime,
        speaker: currentSpeaker,
      })
      chunkIndex++

      // Calculate overlap from end of current text
      const words = currentText.trim().split(/\s+/)
      overlapText = words.slice(-overlapWords).join(' ')

      // Start new chunk with overlap
      currentText = overlapText + ' '
      currentWords = overlapWords
      currentStartTime = segment.start
      currentSpeaker = null
    }

    // Track first start time
    if (currentStartTime === null) {
      currentStartTime = segment.start
    }

    // Track speaker (use most frequent or first)
    if (currentSpeaker === null) {
      currentSpeaker = segment.speaker
    } else if (currentSpeaker !== segment.speaker) {
      currentSpeaker = 'multiple'
    }

    currentText += segment.text.trim() + ' '
    currentWords += segmentWords
    currentEndTime = segment.end
  }

  // Don't forget the last chunk
  if (currentText.trim().length > 0) {
    chunks.push({
      chunk_index: chunkIndex,
      text: currentText.trim(),
      start_time: currentStartTime,
      end_time: currentEndTime,
      speaker: currentSpeaker,
    })
  }

  return chunks
}

/**
 * Split full text into chunks when segments are not available.
 */
export function splitTextIntoChunks(
  fullText: string,
  targetWords: number = CHUNK_TARGET_WORDS,
  overlapWords: number = CHUNK_OVERLAP_WORDS
): TranscriptChunk[] {
  if (!fullText || fullText.trim().length === 0) return []

  const sentences = fullText.split(/(?<=[.!?])\s+/)
  const chunks: TranscriptChunk[] = []
  let currentText = ''
  let currentWords = 0
  let chunkIndex = 0

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length

    if (currentWords > 0 && currentWords + sentenceWords > targetWords) {
      chunks.push({
        chunk_index: chunkIndex,
        text: currentText.trim(),
        start_time: null,
        end_time: null,
        speaker: null,
      })
      chunkIndex++

      // Overlap
      const words = currentText.trim().split(/\s+/)
      currentText = words.slice(-overlapWords).join(' ') + ' '
      currentWords = overlapWords
    }

    currentText += sentence.trim() + ' '
    currentWords += sentenceWords
  }

  if (currentText.trim().length > 0) {
    chunks.push({
      chunk_index: chunkIndex,
      text: currentText.trim(),
      start_time: null,
      end_time: null,
      speaker: null,
    })
  }

  return chunks
}

// ============================================
// Embedding Generation
// ============================================

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable')
  }
  return new GoogleGenAI({ apiKey })
}

/**
 * Generate embeddings for an array of texts using Gemini embedding model.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getGeminiClient()
  const embeddings: number[][] = []

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE)

    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: {
        taskType: 'SEMANTIC_SIMILARITY',
      },
    })

    if (response.embeddings) {
      for (const emb of response.embeddings) {
        embeddings.push(emb.values || [])
      }
    }
  }

  return embeddings
}

/**
 * Generate a single embedding for a query text.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const client = getGeminiClient()

  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: 'SEMANTIC_SIMILARITY',
    },
  })

  if (!response.embeddings || response.embeddings.length === 0) {
    throw new Error('Failed to generate query embedding')
  }

  return response.embeddings[0].values || []
}

// ============================================
// Main: Generate and Store Embeddings
// ============================================

export async function generateAndStoreEmbeddings(
  recordingId: string,
  segments: TranscriptSegment[],
  fullText: string
): Promise<number> {
  console.log(`[Embeddings] Generating embeddings for recording ${recordingId}`)

  // Split into chunks
  const chunks = segments.length > 0
    ? splitTranscriptIntoChunks(segments)
    : splitTextIntoChunks(fullText)

  if (chunks.length === 0) {
    console.warn('[Embeddings] No chunks to embed')
    return 0
  }

  console.log(`[Embeddings] Split transcript into ${chunks.length} chunks`)

  // Generate embeddings
  const texts = chunks.map(c => c.text)
  const embeddings = await generateEmbeddings(texts)

  console.log(`[Embeddings] Generated ${embeddings.length} embeddings`)

  // Store in database
  const supabase = getSupabaseClient()

  // Delete existing chunks for this recording (re-embedding)
  await supabase
    .from('transcript_chunks')
    .delete()
    .eq('recording_id', recordingId)

  // Insert new chunks with embeddings
  const rows = chunks.map((chunk, i) => ({
    recording_id: recordingId,
    chunk_index: chunk.chunk_index,
    text: chunk.text,
    start_time: chunk.start_time,
    end_time: chunk.end_time,
    speaker: chunk.speaker,
    embedding: `[${embeddings[i].join(',')}]`,
  }))

  // Insert in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const { error } = await supabase
      .from('transcript_chunks')
      .insert(batch)

    if (error) {
      console.error(`[Embeddings] Failed to insert batch ${i / 50 + 1}:`, error)
      throw error
    }
  }

  console.log(`[Embeddings] Stored ${rows.length} chunks with embeddings`)
  return rows.length
}
