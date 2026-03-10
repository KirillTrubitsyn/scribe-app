import { ElevenLabsClient } from 'elevenlabs'
import type { SpeechToTextWordResponseModel } from 'elevenlabs/api'

// ============================================
// Types
// ============================================

export interface ElevenLabsTranscribeOptions {
  languageCode?: string
  diarize?: boolean
  tagAudioEvents?: boolean
  keyterms?: string[]
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

// ============================================
// Client
// ============================================

function getClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY environment variable')
  }

  return new ElevenLabsClient({ apiKey })
}

// ============================================
// Transcription
// ============================================

/**
 * Transcribe audio using ElevenLabs Scribe v2 via cloud_storage_url.
 * The audio is NOT downloaded to the worker — ElevenLabs fetches it directly from the URL.
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

  console.log('[ElevenLabs] Starting transcription with Scribe v2')
  console.log(`[ElevenLabs] Language: ${languageCode}, diarize: ${diarize}, tagAudioEvents: ${tagAudioEvents}`)

  const client = getClient()

  const response = await client.speechToText.convert(
    {
      model_id: 'scribe_v2',
      cloud_storage_url: audioUrl,
      language_code: languageCode,
      diarize,
      tag_audio_events: tagAudioEvents,
      timestamps_granularity: 'word',
    },
    {
      timeoutInSeconds: 3600,
    }
  )

  console.log(`[ElevenLabs] Transcription complete: ${response.words.length} words, language: ${response.language_code}`)

  // Convert SDK response to our internal format
  const words = response.words.map((w: SpeechToTextWordResponseModel): ElevenLabsWord => ({
    text: w.text,
    start: w.start ?? 0,
    end: w.end ?? 0,
    type: w.type as 'word' | 'spacing' | 'audio_event',
    speakerId: w.speaker_id ?? null,
  }))

  return {
    text: response.text,
    languageCode: response.language_code,
    languageProbability: response.language_probability,
    words,
  }
}
