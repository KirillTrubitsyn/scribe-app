import { SpeechClient, protos } from '@google-cloud/speech'
import type { TranscriptSegment } from './supabase.js'
import type { TranscriptData, SpeakerData } from './webhook.js'

// ============================================
// Types
// ============================================

type RecognitionConfig = protos.google.cloud.speech.v1.IRecognitionConfig
type LongRunningRecognizeResponse = protos.google.cloud.speech.v1.ILongRunningRecognizeResponse
type SpeechRecognitionResult = protos.google.cloud.speech.v1.ISpeechRecognitionResult
type SpeechRecognitionAlternative = protos.google.cloud.speech.v1.ISpeechRecognitionAlternative
type WordInfo = protos.google.cloud.speech.v1.IWordInfo

export interface TranscriptionResult {
  transcript: TranscriptData
  speakers: SpeakerData[]
  durationSeconds: number
}

// ============================================
// Configuration
// ============================================

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
    throw new Error('Invalid GOOGLE_CREDENTIALS_JSON format')
  }
}

function getSpeechClient(): SpeechClient {
  const { projectId, credentials } = getGoogleCredentials()

  return new SpeechClient({
    projectId,
    credentials,
  })
}

// ============================================
// Transcription
// ============================================

const POLL_INTERVAL_MS = 5000
const MAX_POLL_TIME_MS = 30 * 60 * 1000 // 30 minutes

export async function transcribeAudio(gcsUri: string): Promise<TranscriptionResult> {
  console.log(`[Transcription] Starting transcription for ${gcsUri}`)

  const client = getSpeechClient()

  // Configure Chirp 3 batch recognition
  const config: RecognitionConfig = {
    // Chirp 3 model for high-quality transcription
    model: 'chirp_2',
    // Language - Russian with auto-detection fallback
    languageCode: 'ru-RU',
    alternativeLanguageCodes: ['en-US'],
    // Enable automatic punctuation
    enableAutomaticPunctuation: true,
    // Enable word-level timestamps
    enableWordTimeOffsets: true,
    // Enable speaker diarization
    diarizationConfig: {
      enableSpeakerDiarization: true,
      minSpeakerCount: 1,
      maxSpeakerCount: 10,
    },
    // Use enhanced model for better accuracy
    useEnhanced: true,
  }

  const request = {
    config,
    audio: {
      uri: gcsUri,
    },
  }

  // Start long-running recognition operation
  console.log('[Transcription] Starting batch recognition operation...')
  const [operation] = await client.longRunningRecognize(request)

  const operationName = operation.name
  console.log(`[Transcription] Operation started: ${operationName}`)

  // Poll for completion
  const startTime = Date.now()

  while (true) {
    const [response] = await operation.promise()

    if (response) {
      console.log('[Transcription] Operation completed')
      return processTranscriptionResponse(response)
    }

    // Check timeout
    if (Date.now() - startTime > MAX_POLL_TIME_MS) {
      throw new Error('Transcription timeout: operation took too long')
    }

    console.log('[Transcription] Still processing, waiting...')
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

// ============================================
// Response Processing
// ============================================

function processTranscriptionResponse(
  response: LongRunningRecognizeResponse
): TranscriptionResult {
  const results = response.results || []

  if (results.length === 0) {
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

  const segments: TranscriptSegment[] = []
  const speakerSet = new Set<number>()
  let fullText = ''
  let totalWords = 0
  let maxEndTime = 0
  let detectedLanguage = 'ru-RU'

  for (const result of results) {
    if (!result.alternatives || result.alternatives.length === 0) {
      continue
    }

    const alternative = result.alternatives[0] as SpeechRecognitionAlternative
    const transcript = alternative.transcript || ''
    const confidence = alternative.confidence || 0
    const words = alternative.words || []

    // Detect language from result
    if (result.languageCode) {
      detectedLanguage = result.languageCode
    }

    // Group words by speaker
    const speakerGroups = groupWordsBySpeaker(words)

    for (const group of speakerGroups) {
      const speakerTag = group.speakerTag
      speakerSet.add(speakerTag)

      const segmentText = group.words.map(w => w.word || '').join(' ')
      const segmentWords = group.words.map(w => ({
        word: w.word || '',
        start: secondsFromDuration(w.startTime),
        end: secondsFromDuration(w.endTime),
        confidence: confidence,
      }))

      const startTime = secondsFromDuration(group.words[0]?.startTime)
      const endTime = secondsFromDuration(group.words[group.words.length - 1]?.endTime)

      maxEndTime = Math.max(maxEndTime, endTime)

      segments.push({
        speaker: `Speaker ${speakerTag}`,
        start: startTime,
        end: endTime,
        text: segmentText,
        confidence,
        words: segmentWords,
      })

      totalWords += group.words.length
    }

    fullText += (fullText ? ' ' : '') + transcript
  }

  // Create speaker data
  const speakers: SpeakerData[] = Array.from(speakerSet).map(tag => ({
    speaker_index: tag,
    name: undefined,
    role: undefined,
  }))

  return {
    transcript: {
      full_text: fullText.trim(),
      segments,
      word_count: totalWords,
      language: detectedLanguage,
    },
    speakers,
    durationSeconds: Math.ceil(maxEndTime),
  }
}

interface WordGroup {
  speakerTag: number
  words: WordInfo[]
}

function groupWordsBySpeaker(words: WordInfo[]): WordGroup[] {
  const groups: WordGroup[] = []
  let currentGroup: WordGroup | null = null

  for (const word of words) {
    const speakerTag = word.speakerTag || 0

    if (!currentGroup || currentGroup.speakerTag !== speakerTag) {
      currentGroup = {
        speakerTag,
        words: [],
      }
      groups.push(currentGroup)
    }

    currentGroup.words.push(word)
  }

  return groups
}

function secondsFromDuration(duration: protos.google.protobuf.IDuration | null | undefined): number {
  if (!duration) return 0

  const seconds = Number(duration.seconds || 0)
  const nanos = Number(duration.nanos || 0)

  return seconds + nanos / 1e9
}
