// ============================================
// Types
// ============================================

export interface ElevenLabsTranscribeOptions {
  languageCode?: string
  diarize?: boolean
  tagAudioEvents?: boolean
}

export interface ElevenLabsWord {
  text: string
  start: number
  end: number
  type: 'word' | 'spacing' | 'audio_event'
  speakerId: string | null
}

export interface ElevenLabsTranscriptionResult {
  text: string
  languageCode: string
  languageProbability: number
  words: ElevenLabsWord[]
}

interface ElevenLabsApiWordResponse {
  text: string
  start?: number
  end?: number
  type: string
  speaker_id?: string
}

interface ElevenLabsApiResponse {
  text: string
  language_code: string
  language_probability: number
  words: ElevenLabsApiWordResponse[]
}

// ============================================
// Transcription
// ============================================

/**
 * Transcribe audio using ElevenLabs Speech-to-Text API.
 * Downloads the audio from the signed URL, then uploads it to ElevenLabs as multipart/form-data.
 */
export async function transcribeWithElevenLabs(
  audioUrl: string,
  options: ElevenLabsTranscribeOptions = {}
): Promise<ElevenLabsTranscriptionResult> {
  const {
    languageCode = 'rus',
    diarize = true,
    tagAudioEvents = true,
  } = options

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY environment variable')
  }

  console.log('[ElevenLabs] Starting transcription with Scribe v2')
  console.log(`[ElevenLabs] Language: ${languageCode}, diarize: ${diarize}, tagAudioEvents: ${tagAudioEvents}`)

  // Step 1: Download audio from signed URL
  console.log('[ElevenLabs] Downloading audio from signed URL...')
  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`)
  }
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())
  console.log(`[ElevenLabs] Downloaded ${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB`)

  // Step 2: Build multipart/form-data request
  const formData = new FormData()
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
  formData.append('file', audioBlob, 'audio.mp3')
  formData.append('model_id', 'scribe_v2')
  formData.append('language_code', languageCode)
  formData.append('diarize', String(diarize))
  formData.append('tag_audio_events', String(tagAudioEvents))
  formData.append('timestamps_granularity', 'word')

  // Step 3: Call ElevenLabs API directly
  console.log('[ElevenLabs] Sending to ElevenLabs Speech-to-Text API...')
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`ElevenLabs API error ${response.status}: ${errorBody}`)
  }

  const result = (await response.json()) as ElevenLabsApiResponse

  console.log(`[ElevenLabs] Transcription complete: ${result.words.length} words, language: ${result.language_code}`)

  // Convert to internal format
  const words: ElevenLabsWord[] = result.words.map((w) => ({
    text: w.text,
    start: w.start ?? 0,
    end: w.end ?? 0,
    type: w.type as 'word' | 'spacing' | 'audio_event',
    speakerId: w.speaker_id ?? null,
  }))

  return {
    text: result.text,
    languageCode: result.language_code,
    languageProbability: result.language_probability,
    words,
  }
}
