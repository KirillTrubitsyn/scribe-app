import { v2, protos } from '@google-cloud/speech'
import type { TranscriptSegment } from './supabase.js'
import type { TranscriptData, SpeakerData } from './webhook.js'

// ============================================
// Types
// ============================================

// V2 API types
const { SpeechClient } = v2
type SpeechClientV2 = InstanceType<typeof SpeechClient>

type IBatchRecognizeResponse = protos.google.cloud.speech.v2.IBatchRecognizeResponse
type IBatchRecognizeFileResult = protos.google.cloud.speech.v2.IBatchRecognizeFileResult
type ISpeechRecognitionResult = protos.google.cloud.speech.v2.ISpeechRecognitionResult

export interface TranscriptionResult {
  transcript: TranscriptData
  speakers: SpeakerData[]
  durationSeconds: number
}

interface WordWithMeta {
  word: string
  start: number
  end: number
  confidence: number
  speakerTag: number
}

// ============================================
// Configuration
// ============================================

// Pause threshold for segment splitting (in seconds)
const PAUSE_THRESHOLD_SECONDS = 2.0

// Polling configuration
const POLL_INTERVAL_MS = 10000 // 10 seconds
const MAX_POLL_TIME_MS = 60 * 60 * 1000 // 1 hour for long recordings

// ============================================
// Error Message Parsing
// ============================================

interface ParsedError {
  userMessage: string
  technicalDetails: string
  errorType: 'permission' | 'not_found' | 'invalid_audio' | 'quota' | 'timeout' | 'unknown'
}

/**
 * Parse GCP error messages and return user-friendly versions
 */
function parseTranscriptionError(rawError: string): ParsedError {
  const lowerError = rawError.toLowerCase()

  // Permission/access denied errors
  if (
    lowerError.includes('does not have') &&
    (lowerError.includes('permission') || lowerError.includes('access'))
  ) {
    return {
      userMessage: 'Не удалось получить доступ к аудиофайлу. Пожалуйста, попробуйте загрузить файл заново.',
      technicalDetails: rawError,
      errorType: 'permission',
    }
  }

  if (lowerError.includes('storage.objects.get') || lowerError.includes('denied on resource')) {
    return {
      userMessage: 'Ошибка доступа к файлу в хранилище. Пожалуйста, попробуйте загрузить файл заново.',
      technicalDetails: rawError,
      errorType: 'permission',
    }
  }

  // File not found errors
  if (
    lowerError.includes('not found') ||
    lowerError.includes('does not exist') ||
    lowerError.includes('no such object')
  ) {
    return {
      userMessage: 'Аудиофайл не найден. Возможно, он был удален. Пожалуйста, загрузите файл заново.',
      technicalDetails: rawError,
      errorType: 'not_found',
    }
  }

  // Invalid audio format errors
  if (
    lowerError.includes('invalid audio') ||
    lowerError.includes('unsupported format') ||
    lowerError.includes('audio encoding') ||
    lowerError.includes('could not decode')
  ) {
    return {
      userMessage: 'Формат аудиофайла не поддерживается. Пожалуйста, используйте MP3, WAV, M4A или WebM.',
      technicalDetails: rawError,
      errorType: 'invalid_audio',
    }
  }

  // Quota/rate limit errors
  if (
    lowerError.includes('quota') ||
    lowerError.includes('rate limit') ||
    lowerError.includes('resource exhausted')
  ) {
    return {
      userMessage: 'Сервис временно перегружен. Пожалуйста, попробуйте через несколько минут.',
      technicalDetails: rawError,
      errorType: 'quota',
    }
  }

  // Timeout errors
  if (lowerError.includes('timeout') || lowerError.includes('deadline exceeded')) {
    return {
      userMessage: 'Превышено время обработки. Попробуйте загрузить файл меньшего размера или разделить длинную запись на части.',
      technicalDetails: rawError,
      errorType: 'timeout',
    }
  }

  // Default: unknown error
  return {
    userMessage: 'Произошла ошибка при обработке аудио. Пожалуйста, попробуйте еще раз.',
    technicalDetails: rawError,
    errorType: 'unknown',
  }
}

function getGoogleCredentials(): { projectId: string; credentials: object } {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON

  if (!credentialsJson) {
    throw new Error('Missing GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable')
  }

  try {
    const credentials = JSON.parse(credentialsJson)
    return {
      projectId: credentials.project_id,
      credentials,
    }
  } catch (error) {
    throw new Error('Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON format')
  }
}

// Chirp 2 is only available in specific regions
const CHIRP_LOCATION = 'us-central1'

function getSpeechClient(): SpeechClientV2 {
  const { projectId, credentials } = getGoogleCredentials()

  return new SpeechClient({
    projectId,
    credentials,
    // Use regional endpoint for Chirp 2 model
    apiEndpoint: `${CHIRP_LOCATION}-speech.googleapis.com`,
  })
}

// ============================================
// Main Transcription Function
// ============================================

export async function transcribeAudio(gcsUri: string): Promise<TranscriptionResult> {
  console.log(`[Transcription] Starting Chirp batch transcription for ${gcsUri}`)

  try {
    const client = getSpeechClient()
    const { projectId } = getGoogleCredentials()

    // Build recognizer path for v2 API (using regional location for Chirp 2)
    const recognizerPath = `projects/${projectId}/locations/${CHIRP_LOCATION}/recognizers/_`

    // Start Batch Recognition with Chirp
    console.log('[Transcription] Initiating batch recognition operation...')

    const [operation] = await client.batchRecognize({
      recognizer: recognizerPath,
      config: {
        // Auto-detect audio encoding
        autoDecodingConfig: {},
        // Language codes with Russian primary, English fallback
        languageCodes: ['ru-RU', 'en-US'],
        // Chirp 2 model for best quality
        model: 'chirp_2',
        features: {
          // Enable word-level timestamps
          enableWordTimeOffsets: true,
          // Note: Chirp 2 doesn't support:
          // - enableAutomaticPunctuation (auto-included)
          // - enableWordConfidence (not available)
          // - diarizationConfig (not supported for this model)
        },
      },
      files: [{ uri: gcsUri }],
      recognitionOutputConfig: {
        // Return results inline (not to GCS)
        inlineResponseConfig: {},
      },
    })

    const operationName = operation.name
    console.log(`[Transcription] Operation started: ${operationName}`)

    // Poll for completion
    const response = await pollOperation(operation)

    // Parse and return results
    console.log('[Transcription] Processing results...')
    return processChirpResponse(response, gcsUri)
  } catch (error) {
    // Handle errors from the API call itself
    const rawError = error instanceof Error ? error.message : String(error)
    console.error('[Transcription] API error:', rawError)

    // Check if the error is already user-friendly (from processChirpResponse)
    // by checking if it doesn't contain typical GCP technical markers
    const isAlreadyUserFriendly =
      !rawError.includes('@') &&
      !rawError.includes('gserviceaccount.com') &&
      !rawError.includes('storage.objects') &&
      !rawError.includes('gs://')

    if (isAlreadyUserFriendly) {
      throw error
    }

    // Parse and convert to user-friendly message
    const parsed = parseTranscriptionError(rawError)
    console.error('[Transcription] Error type:', parsed.errorType)
    throw new Error(parsed.userMessage)
  }
}

// ============================================
// Operation Polling
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollOperation(
  operation: any
): Promise<IBatchRecognizeResponse> {
  const startTime = Date.now()
  let lastProgressLog = 0

  while (true) {
    // Check if operation is complete
    const [response] = await operation.promise()

    if (response) {
      console.log('[Transcription] Operation completed successfully')
      return response as IBatchRecognizeResponse
    }

    // Check timeout
    const elapsed = Date.now() - startTime
    if (elapsed > MAX_POLL_TIME_MS) {
      const minutes = Math.round(elapsed / 60000)
      console.error(`[Transcription] Timeout after ${minutes} minutes`)
      throw new Error('Превышено время обработки. Попробуйте загрузить файл меньшего размера или разделить длинную запись на части.')
    }

    // Log progress periodically (every 30 seconds)
    if (elapsed - lastProgressLog >= 30000) {
      const minutes = Math.round(elapsed / 60000)
      console.log(`[Transcription] Still processing... (${minutes} min elapsed)`)
      lastProgressLog = elapsed
    }

    // Wait before next poll
    await sleep(POLL_INTERVAL_MS)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================
// Response Processing
// ============================================

function processChirpResponse(
  response: IBatchRecognizeResponse,
  gcsUri: string
): TranscriptionResult {
  // Get results for our file
  const results = response.results || {}
  const fileResult = results[gcsUri] as IBatchRecognizeFileResult | undefined

  if (!fileResult) {
    console.log('[Transcription] No file result found for URI')
    return createEmptyResult()
  }

  // Check for errors
  if (fileResult.error) {
    const rawError = fileResult.error.message || 'Unknown transcription error'
    const parsed = parseTranscriptionError(rawError)

    console.error('[Transcription] Error in file result:', rawError)
    console.error('[Transcription] Error type:', parsed.errorType)

    // Throw user-friendly message but include technical details in a structured way
    throw new Error(parsed.userMessage)
  }

  // Get transcript results from the file result
  const transcriptData = fileResult.transcript
  if (!transcriptData || !transcriptData.results || transcriptData.results.length === 0) {
    console.log('[Transcription] Empty transcript results')
    return createEmptyResult()
  }

  const transcriptResults = transcriptData.results

  // Extract all words with metadata
  const allWords = extractAllWords(transcriptResults)

  if (allWords.length === 0) {
    console.log('[Transcription] No words extracted from results')
    return createEmptyResult()
  }

  // Group words into segments by speaker change or pause
  const segments = groupWordsIntoSegments(allWords)

  // Build full text
  const fullText = segments.map(s => s.text).join(' ')

  // Collect unique speakers
  const speakerSet = new Set<number>()
  for (const segment of segments) {
    const speakerIndex = parseInt(segment.speaker.replace('Speaker ', ''), 10)
    if (!isNaN(speakerIndex)) {
      speakerSet.add(speakerIndex)
    }
  }

  // Calculate total duration
  const maxEndTime = allWords.length > 0
    ? Math.max(...allWords.map(w => w.end))
    : 0

  // Detect primary language from first result
  const detectedLanguage = transcriptResults[0]?.languageCode || 'ru-RU'

  // Calculate total word count
  const wordCount = allWords.length

  // Build speaker data
  const speakers: SpeakerData[] = Array.from(speakerSet)
    .sort((a, b) => a - b)
    .map(index => ({
      speaker_index: index,
      name: undefined,
      role: undefined,
    }))

  console.log(`[Transcription] Processed: ${wordCount} words, ${segments.length} segments, ${speakers.length} speakers`)

  return {
    transcript: {
      full_text: fullText.trim(),
      segments,
      word_count: wordCount,
      language: detectedLanguage,
    },
    speakers,
    durationSeconds: Math.ceil(maxEndTime),
  }
}

function createEmptyResult(): TranscriptionResult {
  return {
    transcript: {
      full_text: '',
      segments: [],
      word_count: 0,
      language: 'unknown',
    },
    speakers: [],
    durationSeconds: 0,
  }
}

// ============================================
// Word Extraction
// ============================================

function extractAllWords(results: ISpeechRecognitionResult[]): WordWithMeta[] {
  const words: WordWithMeta[] = []

  for (const result of results) {
    const alternatives = result.alternatives || []
    if (alternatives.length === 0) continue

    const alternative = alternatives[0]
    const resultWords = alternative.words || []
    const defaultConfidence = alternative.confidence || 0

    for (const wordInfo of resultWords) {
      const word = wordInfo.word || ''
      if (!word.trim()) continue

      words.push({
        word: word.trim(),
        start: durationToSeconds(wordInfo.startOffset),
        end: durationToSeconds(wordInfo.endOffset),
        confidence: wordInfo.confidence ?? defaultConfidence,
        speakerTag: wordInfo.speakerLabel ? parseInt(wordInfo.speakerLabel, 10) || 0 : 0,
      })
    }
  }

  // Sort by start time
  words.sort((a, b) => a.start - b.start)

  return words
}

function durationToSeconds(duration: protos.google.protobuf.IDuration | null | undefined): number {
  if (!duration) return 0

  const seconds = Number(duration.seconds || 0)
  const nanos = Number(duration.nanos || 0)

  return seconds + nanos / 1e9
}

// ============================================
// Segment Grouping
// ============================================

function groupWordsIntoSegments(words: WordWithMeta[]): TranscriptSegment[] {
  if (words.length === 0) return []

  const segments: TranscriptSegment[] = []
  let currentSegmentWords: WordWithMeta[] = []
  let currentSpeaker = words[0].speakerTag

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const prevWord = i > 0 ? words[i - 1] : null

    // Check if we should start a new segment
    const speakerChanged = word.speakerTag !== currentSpeaker
    const pauseDetected = prevWord !== null && (word.start - prevWord.end) > PAUSE_THRESHOLD_SECONDS

    if (speakerChanged || pauseDetected) {
      // Save current segment if it has words
      if (currentSegmentWords.length > 0) {
        segments.push(createSegment(currentSegmentWords, currentSpeaker))
      }

      // Start new segment
      currentSegmentWords = []
      currentSpeaker = word.speakerTag
    }

    currentSegmentWords.push(word)
  }

  // Don't forget the last segment
  if (currentSegmentWords.length > 0) {
    segments.push(createSegment(currentSegmentWords, currentSpeaker))
  }

  return segments
}

function createSegment(words: WordWithMeta[], speakerTag: number): TranscriptSegment {
  const text = words.map(w => w.word).join(' ')
  const start = words[0].start
  const end = words[words.length - 1].end

  // Calculate average confidence
  const avgConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length

  return {
    speaker: `Speaker ${speakerTag}`,
    start,
    end,
    text,
    confidence: avgConfidence,
    words: words.map(w => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
    })),
  }
}
