import { createClient } from '@supabase/supabase-js'
import type { TranscriptSegment } from './supabase.js'
import type { TranscriptData, SpeakerData } from './webhook.js'
import { transcribeWithElevenLabs, type ElevenLabsWord } from './elevenlabs.js'

// ============================================
// Types
// ============================================

export interface TranscriptionResult {
  transcript: TranscriptData
  speakers: SpeakerData[]
  durationSeconds: number
}

// ============================================
// Configuration
// ============================================

const PAUSE_THRESHOLD_SECONDS = 2.0
const STORAGE_BUCKET = 'audio-files'

function getSupabaseStorageClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getSignedDownloadUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const supabase = getSupabaseStorageClient()

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error) {
    throw new Error(`Failed to create signed download URL: ${error.message}`)
  }

  return data.signedUrl
}

// ============================================
// Public API
// ============================================

/**
 * Get a signed download URL that external services can use to fetch the audio.
 * Used by ElevenLabs API as cloud_storage_url.
 */
export async function getAudioDownloadUrl(storagePath: string): Promise<string> {
  return getSignedDownloadUrl(storagePath, 3600)
}

/**
 * Transcribe audio using ElevenLabs Scribe v2.
 * Generates a signed URL from Supabase Storage and passes it to ElevenLabs.
 * Audio is NOT downloaded to the worker.
 */
export async function transcribeAudio(
  storagePath: string
): Promise<TranscriptionResult> {
  console.log(`[Transcription] ========================================`)
  console.log(`[Transcription] Starting ElevenLabs Scribe v2 transcription`)
  console.log(`[Transcription] Storage path: ${storagePath}`)
  console.log(`[Transcription] ========================================`)

  try {
    // 1. Generate signed URL for ElevenLabs to fetch the audio
    console.log('[Transcription] Generating signed download URL...')
    const audioUrl = await getAudioDownloadUrl(storagePath)
    console.log('[Transcription] Signed URL generated')

    // 2. Transcribe with ElevenLabs
    const result = await transcribeWithElevenLabs(audioUrl, {
      languageCode: 'rus',
      diarize: true,
      tagAudioEvents: true,
    })

    // 3. Convert ElevenLabs response to our segment format
    const { segments, speakers } = convertToSegments(result.words)

    const fullText = result.text
    const wordCount = result.words.filter(w => w.type === 'word').length

    // Calculate duration from last word
    const lastWord = result.words.filter(w => w.end > 0).pop()
    const durationSeconds = lastWord ? Math.ceil(lastWord.end) : 0

    // Map language code (ElevenLabs uses ISO-639-3 like 'rus', we store 'ru-RU')
    const language = mapLanguageCode(result.languageCode)

    console.log(`[Transcription] Completed: ${wordCount} words, ${segments.length} segments, ${speakers.length} speakers`)

    if (wordCount === 0) {
      return createEmptyResult()
    }

    return {
      transcript: {
        full_text: fullText.trim(),
        segments,
        word_count: wordCount,
        language,
      },
      speakers,
      durationSeconds,
    }
  } catch (error) {
    const rawError = error instanceof Error ? error.message : String(error)
    console.error('[Transcription] Error:', rawError)

    const userMessage = parseTranscriptionError(rawError)
    throw new Error(userMessage)
  }
}

// ============================================
// ElevenLabs → Segments Conversion
// ============================================

function convertToSegments(words: ElevenLabsWord[]): {
  segments: TranscriptSegment[]
  speakers: SpeakerData[]
} {
  // Filter out spacing tokens, keep words and audio_events
  const meaningfulWords = words.filter(w => w.type !== 'spacing')

  if (meaningfulWords.length === 0) {
    return { segments: [], speakers: [] }
  }

  const segments: TranscriptSegment[] = []
  let currentWords: ElevenLabsWord[] = []
  let currentSpeaker = meaningfulWords[0].speakerId

  for (let i = 0; i < meaningfulWords.length; i++) {
    const word = meaningfulWords[i]
    const prevWord = i > 0 ? meaningfulWords[i - 1] : null

    const speakerChanged = word.speakerId !== currentSpeaker
    const pauseDetected = prevWord !== null && (word.start - prevWord.end) > PAUSE_THRESHOLD_SECONDS

    if ((speakerChanged || pauseDetected) && currentWords.length > 0) {
      segments.push(buildSegment(currentWords, currentSpeaker))
      currentWords = []
      currentSpeaker = word.speakerId
    }

    currentWords.push(word)
  }

  // Flush remaining
  if (currentWords.length > 0) {
    segments.push(buildSegment(currentWords, currentSpeaker))
  }

  // Collect unique speakers
  const speakerIds = new Set<string>()
  for (const word of meaningfulWords) {
    if (word.speakerId) {
      speakerIds.add(word.speakerId)
    }
  }

  const speakers: SpeakerData[] = Array.from(speakerIds)
    .sort()
    .map((id, index) => ({
      speaker_index: index,
      name: undefined,
      role: undefined,
    }))

  return { segments, speakers }
}

function buildSegment(words: ElevenLabsWord[], speakerId: string | null): TranscriptSegment {
  // Build text: words are joined with spaces, audio_events included as-is
  const text = words.map(w => w.text).join(' ')
  const start = words[0].start
  const end = words[words.length - 1].end

  // Map speaker_id (e.g. "speaker_0") to "Speaker 0"
  const speakerLabel = speakerId
    ? `Speaker ${speakerId.replace('speaker_', '')}`
    : 'Speaker 0'

  return {
    speaker: speakerLabel,
    start,
    end,
    text,
    confidence: 1.0,
    words: words
      .filter(w => w.type === 'word')
      .map(w => ({
        word: w.text,
        start: w.start,
        end: w.end,
        confidence: 1.0,
      })),
  }
}

// ============================================
// Language Code Mapping
// ============================================

function mapLanguageCode(code: string): string {
  const map: Record<string, string> = {
    rus: 'ru-RU',
    eng: 'en-US',
    deu: 'de-DE',
    fra: 'fr-FR',
    spa: 'es-ES',
    ita: 'it-IT',
    por: 'pt-BR',
    jpn: 'ja-JP',
    zho: 'zh-CN',
    kor: 'ko-KR',
    ukr: 'uk-UA',
  }
  return map[code] || code
}

// ============================================
// Error Handling
// ============================================

function parseTranscriptionError(rawError: string): string {
  const lowerError = rawError.toLowerCase()

  if (lowerError.includes('permission') || lowerError.includes('access denied') || lowerError.includes('forbidden')) {
    return 'Не удалось получить доступ к аудиофайлу. Пожалуйста, попробуйте загрузить файл заново.'
  }

  if (lowerError.includes('not found') || lowerError.includes('does not exist')) {
    return 'Аудиофайл не найден. Возможно, он был удален. Пожалуйста, загрузите файл заново.'
  }

  if (lowerError.includes('invalid') || lowerError.includes('unsupported')) {
    return 'Формат аудиофайла не поддерживается. Пожалуйста, используйте MP3, WAV, M4A или WebM.'
  }

  if (lowerError.includes('quota') || lowerError.includes('rate limit') || lowerError.includes('429')) {
    return 'Сервис временно перегружен. Пожалуйста, попробуйте через несколько минут.'
  }

  if (lowerError.includes('timeout') || lowerError.includes('deadline')) {
    return 'Превышено время обработки. Попробуйте загрузить файл меньшего размера.'
  }

  if (lowerError.includes('too large') || lowerError.includes('size limit') || lowerError.includes('2gb')) {
    return 'Файл слишком большой. Максимальный размер — 2 ГБ.'
  }

  if (lowerError.includes('elevenlabs_api_key') || lowerError.includes('api key') || lowerError.includes('unauthorized')) {
    return 'Ошибка аутентификации сервиса транскрипции. Обратитесь к администратору.'
  }

  return 'Произошла ошибка при обработке аудио. Пожалуйста, попробуйте еще раз.'
}

// ============================================
// Utilities
// ============================================

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
