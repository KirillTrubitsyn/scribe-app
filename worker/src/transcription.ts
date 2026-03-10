import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { v2, protos } from '@google-cloud/speech'
import type { TranscriptSegment } from './supabase.js'
import type { TranscriptData, SpeakerData } from './webhook.js'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ============================================
// Types
// ============================================

export type TranscriptionModel = 'gemini' | 'chirp'

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

// V2 API types for Chirp
const { SpeechClient } = v2
type SpeechClientV2 = InstanceType<typeof SpeechClient>

type IBatchRecognizeResponse = protos.google.cloud.speech.v2.IBatchRecognizeResponse
type IBatchRecognizeFileResult = protos.google.cloud.speech.v2.IBatchRecognizeFileResult
type ISpeechRecognitionResult = protos.google.cloud.speech.v2.ISpeechRecognitionResult

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

// Files larger than 4MB should use File API instead of inline data for Gemini
const INLINE_DATA_LIMIT_BYTES = 4 * 1024 * 1024

// Chirp configuration
const CHIRP_LOCATION = 'europe-west2'
const PAUSE_THRESHOLD_SECONDS = 2.0
const MAX_POLL_TIME_MS = 60 * 60 * 1000 // 1 hour

// Gemini File API configuration
const GEMINI_FILE_POLL_INTERVAL_MS = 2000
const GEMINI_FILE_MAX_POLL_TIME_MS = 10 * 60 * 1000 // 10 minutes

// Supabase Storage bucket
const STORAGE_BUCKET = 'audio-files'

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

/**
 * Generate a signed download URL for a file in Supabase Storage.
 * This URL can be used by external services (Gemini, Chirp) to fetch the audio.
 */
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

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable')
  }

  return new GoogleGenAI({ apiKey })
}

function getSpeechClient(): SpeechClientV2 {
  const { projectId, credentials } = getGoogleCredentials()

  return new SpeechClient({
    projectId,
    credentials,
    apiEndpoint: `${CHIRP_LOCATION}-speech.googleapis.com`,
  })
}

// ============================================
// Gemini Transcription Prompt
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

export async function transcribeAudio(
  storagePath: string,
  model: TranscriptionModel
): Promise<TranscriptionResult> {
  console.log(`[Transcription] ========================================`)
  console.log(`[Transcription] transcribeAudio called with model param: "${model}"`)
  console.log(`[Transcription] Storage path: ${storagePath}`)
  console.log(`[Transcription] Model routing decision: model === 'chirp' ? ${model === 'chirp'}`)

  if (model === 'chirp') {
    console.log(`[Transcription] >>> ROUTING TO CHIRP 3 <<<`)
    console.log(`[Transcription] ========================================`)
    return transcribeWithChirp(storagePath)
  }

  console.log(`[Transcription] >>> ROUTING TO GEMINI 3 FLASH <<<`)
  console.log(`[Transcription] ========================================`)
  return transcribeWithGemini(storagePath)
}

// ============================================
// Gemini Transcription
// ============================================

async function transcribeWithGemini(storagePath: string): Promise<TranscriptionResult> {
  console.log(`[Transcription] *** GEMINI 3 FLASH TRANSCRIPTION STARTED ***`)
  console.log(`[Transcription] Calling Google Gemini API (model: gemini-3-flash-preview)`)

  try {
    // 1. Download audio from Supabase Storage via signed URL
    console.log('[Transcription] Downloading audio from Supabase Storage...')
    const audioData = await downloadFromStorage(storagePath)
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
    const transcriptResponse = parseGeminiTranscriptResponse(responseText)

    if (!transcriptResponse || transcriptResponse.segments.length === 0) {
      console.log('[Transcription] No speech detected in audio')
      return createEmptyResult()
    }

    // 4. Convert to expected format
    const segments = convertGeminiToSegments(transcriptResponse.segments)
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

    const userMessage = parseTranscriptionError(rawError)
    throw new Error(userMessage)
  }
}

// ============================================
// Chirp 3 Dynamic Batch Transcription
// ============================================

async function transcribeWithChirp(storagePath: string): Promise<TranscriptionResult> {
  console.log(`[Transcription] *** CHIRP 3 BATCH TRANSCRIPTION STARTED ***`)
  console.log(`[Transcription] Calling Google Speech-to-Text V2 API (model: chirp_3)`)

  try {
    // Generate a signed URL for the audio file — Chirp batch API accepts HTTPS URIs
    console.log('[Transcription] Generating signed URL for Chirp access...')
    const audioUrl = await getSignedDownloadUrl(storagePath, 3600)
    console.log('[Transcription] Signed URL generated successfully')

    const client = getSpeechClient()
    const { projectId } = getGoogleCredentials()

    // Build recognizer path for v2 API (using regional location)
    const recognizerPath = `projects/${projectId}/locations/${CHIRP_LOCATION}/recognizers/_`

    // Start Batch Recognition with Chirp 3 using signed URL
    console.log('[Transcription] Initiating batch recognition operation...')

    const [operation] = await client.batchRecognize({
      recognizer: recognizerPath,
      config: {
        autoDecodingConfig: {},
        languageCodes: ['ru-RU', 'en-US'],
        model: 'chirp_3',
        features: {
          enableWordTimeOffsets: true,
        },
      },
      files: [{ uri: audioUrl }],
      recognitionOutputConfig: {
        inlineResponseConfig: {},
      },
    })

    const operationName = operation.name
    console.log(`[Transcription] Operation started: ${operationName}`)

    // Poll for completion
    const response = await pollChirpOperation(operation)

    // Parse and return results
    console.log('[Transcription] Processing results...')
    return processChirpResponse(response)
  } catch (error) {
    const rawError = error instanceof Error ? error.message : String(error)
    console.error('[Transcription] API error:', rawError)

    const isAlreadyUserFriendly =
      !rawError.includes('@') &&
      !rawError.includes('gserviceaccount.com') &&
      !rawError.includes('storage.objects') &&
      !rawError.includes('gs://')

    if (isAlreadyUserFriendly) {
      throw error
    }

    const userMessage = parseTranscriptionError(rawError)
    throw new Error(userMessage)
  }
}

// ============================================
// Chirp Operation Polling
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollChirpOperation(operation: any): Promise<IBatchRecognizeResponse> {
  console.log('[Transcription] Starting to poll operation...')

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const minutes = Math.round(MAX_POLL_TIME_MS / 60000)
      console.error(`[Transcription] Timeout after ${minutes} minutes`)
      reject(new Error('Превышено время обработки. Попробуйте загрузить файл меньшего размера или разделить длинную запись на части.'))
    }, MAX_POLL_TIME_MS)
  })

  const startTime = Date.now()
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime
    const minutes = Math.round(elapsed / 60000)
    const seconds = Math.round((elapsed % 60000) / 1000)
    console.log(`[Transcription] Still processing... (${minutes}m ${seconds}s elapsed)`)
  }, 30000)

  try {
    console.log('[Transcription] Awaiting operation.promise() with timeout...')
    const [response] = await Promise.race([
      operation.promise(),
      timeoutPromise,
    ])

    console.log('[Transcription] Operation completed successfully')
    return response as IBatchRecognizeResponse
  } finally {
    clearInterval(progressInterval)
  }
}

// ============================================
// Chirp Response Processing
// ============================================

function processChirpResponse(
  response: IBatchRecognizeResponse
): TranscriptionResult {
  console.log('[Transcription] Response keys:', Object.keys(response))

  const results = response.results || {}
  console.log('[Transcription] Results keys:', Object.keys(results))

  // When using inline content, the key may differ from GCS URI
  const resultKeys = Object.keys(results)
  const fileResult = resultKeys.length > 0
    ? results[resultKeys[0]] as IBatchRecognizeFileResult
    : undefined

  if (!fileResult) {
    console.log('[Transcription] No file result found')
    console.log('[Transcription] Available keys:', resultKeys)
    return createEmptyResult()
  }

  // Check for errors
  if (fileResult.error) {
    const rawError = fileResult.error.message || 'Unknown transcription error'
    console.error('[Transcription] Error in file result:', rawError)
    const userMessage = parseTranscriptionError(rawError)
    throw new Error(userMessage)
  }

  console.log('[Transcription] File result keys:', Object.keys(fileResult))

  const inlineResult = fileResult.inlineResult
  console.log('[Transcription] Inline result:', inlineResult ? 'exists' : 'null/undefined')

  const transcriptData = inlineResult?.transcript
  console.log('[Transcription] Transcript data:', transcriptData ? 'exists' : 'null/undefined')

  if (transcriptData) {
    console.log('[Transcription] Transcript results count:', transcriptData.results?.length || 0)
  }

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
  const maxEndTime = allWords.length > 0 ? Math.max(...allWords.map(w => w.end)) : 0

  // Detect primary language from first result
  const detectedLanguage = transcriptResults[0]?.languageCode || 'ru-RU'

  const wordCount = allWords.length

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

  words.sort((a, b) => a.start - b.start)

  return words
}

function durationToSeconds(duration: protos.google.protobuf.IDuration | null | undefined): number {
  if (!duration) return 0

  const seconds = Number(duration.seconds || 0)
  const nanos = Number(duration.nanos || 0)

  return seconds + nanos / 1e9
}

function groupWordsIntoSegments(words: WordWithMeta[]): TranscriptSegment[] {
  if (words.length === 0) return []

  const segments: TranscriptSegment[] = []
  let currentSegmentWords: WordWithMeta[] = []
  let currentSpeaker = words[0].speakerTag

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const prevWord = i > 0 ? words[i - 1] : null

    const speakerChanged = word.speakerTag !== currentSpeaker
    const pauseDetected = prevWord !== null && (word.start - prevWord.end) > PAUSE_THRESHOLD_SECONDS

    if (speakerChanged || pauseDetected) {
      if (currentSegmentWords.length > 0) {
        segments.push(createChirpSegment(currentSegmentWords, currentSpeaker))
      }

      currentSegmentWords = []
      currentSpeaker = word.speakerTag
    }

    currentSegmentWords.push(word)
  }

  if (currentSegmentWords.length > 0) {
    segments.push(createChirpSegment(currentSegmentWords, currentSpeaker))
  }

  return segments
}

function createChirpSegment(words: WordWithMeta[], speakerTag: number): TranscriptSegment {
  const text = words.map(w => w.word).join(' ')
  const start = words[0].start
  const end = words[words.length - 1].end

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

// ============================================
// Supabase Storage Download
// ============================================

interface AudioData {
  size: number
  buffer: Buffer
  base64: string
  mimeType: string
}

async function downloadFromStorage(storagePath: string): Promise<AudioData> {
  console.log(`[Transcription] Downloading from Supabase Storage: ${storagePath}`)

  const signedUrl = await getSignedDownloadUrl(storagePath)

  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error(`Failed to download audio: HTTP ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const mimeType = getMimeType(storagePath)
  const base64 = buffer.toString('base64')

  return {
    size: buffer.length,
    buffer,
    base64,
    mimeType,
  }
}

/**
 * Get a signed download URL that external services can use to fetch the audio.
 * This is the URL that will be passed to ElevenLabs API as cloud_storage_url.
 */
export async function getAudioDownloadUrl(storagePath: string): Promise<string> {
  return getSignedDownloadUrl(storagePath, 3600)
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
// File API Upload (for large files with Gemini)
// ============================================

async function uploadToGeminiFileAPI(
  genAI: GoogleGenAI,
  audioData: AudioData
): Promise<string> {
  console.log('[Transcription] Uploading to Gemini File API...')

  const tempDir = mkdtempSync(join(tmpdir(), 'scribe-'))
  const ext = getExtensionFromMimeType(audioData.mimeType)
  const tempFilePath = join(tempDir, `audio.${ext}`)

  try {
    writeFileSync(tempFilePath, audioData.buffer)

    const uploadResult = await genAI.files.upload({
      file: tempFilePath,
      config: {
        mimeType: audioData.mimeType,
      },
    })

    console.log(`[Transcription] File uploaded: ${uploadResult.name}, state: ${uploadResult.state}`)

    let file = uploadResult
    const fileUploadStartTime = Date.now()
    let lastFileProgressLog = 0

    while (file.state === 'PROCESSING') {
      const elapsed = Date.now() - fileUploadStartTime

      if (elapsed > GEMINI_FILE_MAX_POLL_TIME_MS) {
        const minutes = Math.round(elapsed / 60000)
        console.error(`[Transcription] Gemini File API timeout after ${minutes} minutes`)
        throw new Error('Превышено время загрузки файла в Gemini. Попробуйте загрузить файл меньшего размера.')
      }

      if (elapsed - lastFileProgressLog >= 30000) {
        const minutes = Math.round(elapsed / 60000)
        console.log(`[Transcription] File still processing... (${minutes} min elapsed)`)
        lastFileProgressLog = elapsed
      }

      console.log('[Transcription] Waiting for file processing...')
      await new Promise(resolve => setTimeout(resolve, GEMINI_FILE_POLL_INTERVAL_MS))
      file = await genAI.files.get({ name: file.name! })
    }

    if (file.state === 'FAILED') {
      throw new Error('Не удалось обработать аудиофайл в Gemini. Попробуйте другой формат файла.')
    }

    console.log(`[Transcription] File ready: ${file.uri}`)
    return file.uri!
  } finally {
    try {
      unlinkSync(tempFilePath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================
// Gemini Response Parsing
// ============================================

function parseGeminiTranscriptResponse(response: string): GeminiTranscriptResponse | null {
  let jsonStr = response.trim()

  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

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

function convertGeminiToSegments(geminiSegments: GeminiTranscriptSegment[]): TranscriptSegment[] {
  return geminiSegments.map(seg => ({
    speaker: seg.speaker,
    start: seg.start,
    end: seg.end,
    text: seg.text,
    confidence: 0.95,
    words: [],
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
