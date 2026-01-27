import { Storage } from '@google-cloud/storage'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { TranscriptSegment } from './supabase.js'
import type { TranscriptData, SpeakerData } from './webhook.js'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ============================================
// Types
// ============================================

export interface TranscriptionResult {
  transcript: TranscriptData
  speakers: SpeakerData[]
  durationSeconds: number
}

interface GeminiTranscriptSegment {
  speaker: string
  start: number
  end: number
  text: string
}

interface GeminiTranscriptResponse {
  segments: GeminiTranscriptSegment[]
  language: string
  duration_seconds: number
}

// ============================================
// Configuration
// ============================================

// Files larger than 4MB should use File API instead of inline data
// (base64 adds ~33% overhead, so 4MB base64 ≈ 3MB raw)
const INLINE_DATA_LIMIT_BYTES = 4 * 1024 * 1024

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
  } catch {
    throw new Error('Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON format')
  }
}

function getStorageClient(): Storage {
  const { projectId, credentials } = getGoogleCredentials()

  return new Storage({
    projectId,
    credentials,
  })
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable')
  }

  return new GoogleGenAI({ apiKey })
}

// ============================================
// Transcription Prompt
// ============================================

const TRANSCRIPTION_PROMPT = `Ты — профессиональная система транскрибации аудио.

Твоя задача — ДОСЛОВНО транскрибировать аудиозапись и вернуть результат в формате JSON.

КРИТИЧЕСКИ ВАЖНО — ЗАПРЕЩЁННЫЕ ДЕЙСТВИЯ:
- НИКОГДА не исправляй слова на "правильные" или "логичные"
- НИКОГДА не додумывай и не дополняй слова
- НИКОГДА не заменяй нестандартные фразы на грамматически правильные
- НИКОГДА не "улучшай" текст говорящего
- НИКОГДА не заменяй обрывистые или неполные слова на полные
- Если слово звучит как "гиалурона пауза кисло" — пиши ИМЕННО ТАК, а НЕ "гиалуроновой кислоты"
- Если слово звучит как "кисло сморщино" — пиши ИМЕННО ТАК, а НЕ "кислых морщин"

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
1. Записывай ТОЧНО то, что слышишь — буква в букву, слово в слово
2. Сохраняй все оговорки, запинки, повторы и неправильные формы слов
3. Если слово непонятно — пиши наиболее близкое по звучанию, НЕ угадывай смысл
4. Если говорят несколько человек — определи разных спикеров (Speaker 1, Speaker 2 и т.д.)
5. Укажи временные метки для каждого сегмента речи
6. Определи основной язык аудио
7. Разбивай на сегменты по смене спикера или паузам более 2 секунд

Формат ответа — ТОЛЬКО валидный JSON без markdown:
{
  "segments": [
    {
      "speaker": "Speaker 1",
      "start": 0.0,
      "end": 5.5,
      "text": "Текст сегмента..."
    },
    {
      "speaker": "Speaker 2",
      "start": 5.8,
      "end": 12.3,
      "text": "Ответ другого спикера..."
    }
  ],
  "language": "ru-RU",
  "duration_seconds": 120
}

Если аудио содержит только музыку без речи, верни:
{
  "segments": [],
  "language": "unknown",
  "duration_seconds": 0
}

ПОМНИ: Твоя задача — быть точным стенографистом, а НЕ редактором. Записывай речь КАК ЕСТЬ.

Транскрибируй аудио:`

// ============================================
// Main Transcription Function
// ============================================

export async function transcribeAudio(gcsUri: string): Promise<TranscriptionResult> {
  console.log(`[Transcription] Starting Gemini transcription for ${gcsUri}`)

  try {
    // 1. Download audio from GCS
    console.log('[Transcription] Downloading audio from GCS...')
    const audioData = await downloadFromGcs(gcsUri)
    console.log(`[Transcription] Downloaded ${audioData.size} bytes, mime: ${audioData.mimeType}`)

    // 2. Send to Gemini for transcription
    console.log('[Transcription] Sending to Gemini 3 Flash...')
    const genAI = getGeminiClient()

    // For large files, use File API instead of inline data
    const useFileAPI = audioData.size > INLINE_DATA_LIMIT_BYTES
    let audioContent: object

    if (useFileAPI) {
      console.log(`[Transcription] File is ${(audioData.size / 1024 / 1024).toFixed(2)}MB, using File API`)
      const fileUri = await uploadToGeminiFileAPI(genAI, audioData)
      audioContent = {
        fileData: {
          fileUri,
          mimeType: audioData.mimeType,
        },
      }
    } else {
      console.log(`[Transcription] File is ${(audioData.size / 1024 / 1024).toFixed(2)}MB, using inline data`)
      audioContent = {
        inlineData: {
          mimeType: audioData.mimeType,
          data: audioData.base64,
        },
      }
    }

    const result = await genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { text: TRANSCRIPTION_PROMPT },
        audioContent,
      ],
      config: {
        temperature: 0,
        topP: 1,
        topK: 1,
        maxOutputTokens: 65536,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    })

    const responseText = result.text || ''
    console.log('[Transcription] Received response from Gemini')

    // 3. Parse response
    const transcriptResponse = parseTranscriptResponse(responseText)

    if (!transcriptResponse || transcriptResponse.segments.length === 0) {
      console.log('[Transcription] No speech detected in audio')
      return createEmptyResult()
    }

    // 4. Convert to expected format
    const segments = convertToSegments(transcriptResponse.segments)
    const fullText = segments.map(s => s.text).join(' ')
    const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length

    // Collect unique speakers
    const speakerSet = new Set<number>()
    for (const segment of segments) {
      const match = segment.speaker.match(/Speaker (\d+)/)
      if (match) {
        speakerSet.add(parseInt(match[1], 10))
      }
    }

    const speakers: SpeakerData[] = Array.from(speakerSet)
      .sort((a, b) => a - b)
      .map(index => ({
        speaker_index: index,
        name: undefined,
        role: undefined,
      }))

    console.log(`[Transcription] Completed: ${wordCount} words, ${segments.length} segments, ${speakers.length} speakers`)

    return {
      transcript: {
        full_text: fullText.trim(),
        segments,
        word_count: wordCount,
        language: transcriptResponse.language || 'ru-RU',
      },
      speakers,
      durationSeconds: Math.ceil(transcriptResponse.duration_seconds || 0),
    }
  } catch (error) {
    const rawError = error instanceof Error ? error.message : String(error)
    console.error('[Transcription] Error:', rawError)

    // Convert to user-friendly message
    const userMessage = parseTranscriptionError(rawError)
    throw new Error(userMessage)
  }
}

// ============================================
// GCS Download
// ============================================

interface AudioData {
  size: number
  buffer: Buffer
  base64: string
  mimeType: string
}

async function downloadFromGcs(gcsUri: string): Promise<AudioData> {
  // Parse GCS URI: gs://bucket-name/path/to/file
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/)

  if (!match) {
    throw new Error(`Invalid GCS URI format: ${gcsUri}`)
  }

  const [, bucketName, filePath] = match

  const storage = getStorageClient()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(filePath)

  // Download file content
  const [buffer] = await file.download()

  // Determine MIME type from file extension
  const mimeType = getMimeType(filePath)

  // Convert to base64
  const base64 = buffer.toString('base64')

  return {
    size: buffer.length,
    buffer,
    base64,
    mimeType,
  }
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()

  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
  }

  return mimeTypes[ext || ''] || 'audio/mpeg'
}

function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/aac': 'aac',
  }
  return extensions[mimeType] || 'mp3'
}

// ============================================
// File API Upload (for large files)
// ============================================

async function uploadToGeminiFileAPI(
  genAI: GoogleGenAI,
  audioData: AudioData
): Promise<string> {
  console.log('[Transcription] Uploading to Gemini File API...')

  // Create temp file
  const tempDir = mkdtempSync(join(tmpdir(), 'scribe-'))
  const ext = getExtensionFromMimeType(audioData.mimeType)
  const tempFilePath = join(tempDir, `audio.${ext}`)

  try {
    // Write buffer to temp file
    writeFileSync(tempFilePath, audioData.buffer)

    // Upload using File API
    const uploadResult = await genAI.files.upload({
      file: tempFilePath,
      config: {
        mimeType: audioData.mimeType,
      },
    })

    console.log(`[Transcription] File uploaded: ${uploadResult.name}, state: ${uploadResult.state}`)

    // Wait for file to be processed
    let file = uploadResult
    while (file.state === 'PROCESSING') {
      console.log('[Transcription] Waiting for file processing...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      file = await genAI.files.get({ name: file.name! })
    }

    if (file.state === 'FAILED') {
      throw new Error('File processing failed')
    }

    console.log(`[Transcription] File ready: ${file.uri}`)
    return file.uri!
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempFilePath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================
// Response Parsing
// ============================================

function parseTranscriptResponse(response: string): GeminiTranscriptResponse | null {
  let jsonStr = response.trim()

  // Remove markdown code block if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  // Try to find JSON object in the response
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    jsonStr = objectMatch[0]
  }

  try {
    return JSON.parse(jsonStr) as GeminiTranscriptResponse
  } catch (error) {
    console.error('[Transcription] Failed to parse JSON response:', error)
    console.error('[Transcription] Raw response (first 500 chars):', response.substring(0, 500))
    return null
  }
}

function convertToSegments(geminiSegments: GeminiTranscriptSegment[]): TranscriptSegment[] {
  return geminiSegments.map(seg => ({
    speaker: seg.speaker,
    start: seg.start,
    end: seg.end,
    text: seg.text,
    confidence: 0.95, // Gemini doesn't provide confidence, use default
    words: [], // Word-level data not available from Gemini
  }))
}

// ============================================
// Error Handling
// ============================================

function parseTranscriptionError(rawError: string): string {
  const lowerError = rawError.toLowerCase()

  if (lowerError.includes('permission') || lowerError.includes('access denied')) {
    return 'Не удалось получить доступ к аудиофайлу. Пожалуйста, попробуйте загрузить файл заново.'
  }

  if (lowerError.includes('not found') || lowerError.includes('does not exist')) {
    return 'Аудиофайл не найден. Возможно, он был удален. Пожалуйста, загрузите файл заново.'
  }

  if (lowerError.includes('invalid') || lowerError.includes('unsupported')) {
    return 'Формат аудиофайла не поддерживается. Пожалуйста, используйте MP3, WAV, M4A или WebM.'
  }

  if (lowerError.includes('quota') || lowerError.includes('rate limit')) {
    return 'Сервис временно перегружен. Пожалуйста, попробуйте через несколько минут.'
  }

  if (lowerError.includes('timeout') || lowerError.includes('deadline')) {
    return 'Превышено время обработки. Попробуйте загрузить файл меньшего размера.'
  }

  if (lowerError.includes('too large') || lowerError.includes('size limit')) {
    return 'Файл слишком большой. Попробуйте загрузить файл меньшего размера или разделить на части.'
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
