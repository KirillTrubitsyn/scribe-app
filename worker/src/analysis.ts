import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import type { ArtifactData, TranscriptData, SpeakerData } from './webhook.js'

// ============================================
// Types
// ============================================

export interface AnalysisResult {
  artifacts: ArtifactData[]
}

interface SummaryOutput {
  summary: string
  key_points: string[]
  main_topics: string[]
  participants_mentioned: string[]
}

interface ProtocolOutput {
  title: string
  date: string
  participants: string[]
  agenda: string[]
  discussion: Array<{
    topic: string
    summary: string
    decisions: string[]
  }>
  conclusions: string[]
  next_steps: string[]
}

interface ActionItemsOutput {
  action_items: Array<{
    task: string
    assignee: string | null
    deadline: string | null
    priority: 'high' | 'medium' | 'low'
    context: string
  }>
}

interface AnalyticsOutput {
  speaking_time_distribution: Record<string, number>
  topics_discussed: Array<{
    topic: string
    duration_percentage: number
  }>
  sentiment_overview: {
    overall: 'positive' | 'neutral' | 'negative'
    key_moments: Array<{
      timestamp: string
      sentiment: string
      context: string
    }>
  }
  engagement_metrics: {
    question_count: number
    decision_count: number
    action_items_count: number
  }
  meeting_effectiveness: {
    score: number
    strengths: string[]
    improvements: string[]
  }
}

// ============================================
// Configuration
// ============================================

function getGeminiClient(): GenerativeModel {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable')
  }

  const genAI = new GoogleGenerativeAI(apiKey)

  return genAI.getGenerativeModel({
    model: 'gemini-3.0-flash-preview',
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 8192,
    },
  })
}

// ============================================
// Russian Prompts
// ============================================

const SUMMARY_PROMPT = `Ты — профессиональный ассистент для анализа деловых совещаний.

Проанализируй транскрипт совещания и создай структурированное резюме.

Твой ответ должен быть валидным JSON со следующей структурой:
{
  "summary": "Подробное резюме совещания в 2-3 абзацах",
  "key_points": ["Ключевой вывод 1", "Ключевой вывод 2", ...],
  "main_topics": ["Основная тема 1", "Основная тема 2", ...],
  "participants_mentioned": ["Имя 1", "Имя 2", ...]
}

Сфокусируйся на:
- Главных темах обсуждения
- Принятых решениях
- Важных моментах и договорённостях
- Упомянутых сроках и обязательствах

Пиши чётко, профессионально, по существу.

Транскрипт:
`

const PROTOCOL_PROMPT = `Ты — секретарь совещания. Создай официальный протокол на основе транскрипта.

Твой ответ должен быть валидным JSON со следующей структурой:
{
  "title": "Название совещания (определи по содержанию)",
  "date": "Дата совещания (если упоминается) или 'Не указано'",
  "participants": ["Участник 1", "Участник 2", ...],
  "agenda": ["Пункт повестки 1", "Пункт повестки 2", ...],
  "discussion": [
    {
      "topic": "Название темы",
      "summary": "Краткое содержание обсуждения",
      "decisions": ["Решение 1", "Решение 2"]
    }
  ],
  "conclusions": ["Итог 1", "Итог 2", ...],
  "next_steps": ["Следующий шаг 1", "Следующий шаг 2", ...]
}

Требования:
- Используй деловой стиль
- Формулируй решения чётко и конкретно
- Указывай ответственных, если они упоминаются
- Группируй обсуждение по логическим темам

Транскрипт:
`

const ACTION_ITEMS_PROMPT = `Ты — помощник по управлению задачами. Извлеки все задачи и поручения из транскрипта совещания.

Твой ответ должен быть валидным JSON со следующей структурой:
{
  "action_items": [
    {
      "task": "Описание задачи",
      "assignee": "Имя ответственного или null",
      "deadline": "Срок выполнения или null",
      "priority": "high" | "medium" | "low",
      "context": "Контекст из обсуждения"
    }
  ]
}

Ищи:
- Явные поручения ("Иван, сделай...", "Нужно подготовить...")
- Взятые обязательства ("Я займусь...", "Мы сделаем...")
- Договорённости о действиях
- Упомянутые дедлайны ("до пятницы", "на следующей неделе")

Приоритеты:
- high: срочные задачи, критичные для проекта
- medium: важные, но не срочные задачи
- low: второстепенные задачи, пожелания

Транскрипт:
`

const ANALYTICS_PROMPT = `Ты — аналитик эффективности совещаний. Проанализируй транскрипт и предоставь аналитику.

Твой ответ должен быть валидным JSON со следующей структурой:
{
  "speaking_time_distribution": {
    "Спикер 1": 35,
    "Спикер 2": 45,
    "Остальные": 20
  },
  "topics_discussed": [
    {
      "topic": "Название темы",
      "duration_percentage": 25
    }
  ],
  "sentiment_overview": {
    "overall": "positive" | "neutral" | "negative",
    "key_moments": [
      {
        "timestamp": "Примерное время или ссылка на сегмент",
        "sentiment": "positive/negative/neutral",
        "context": "Краткое описание момента"
      }
    ]
  },
  "engagement_metrics": {
    "question_count": 5,
    "decision_count": 3,
    "action_items_count": 7
  },
  "meeting_effectiveness": {
    "score": 75,
    "strengths": ["Сильная сторона 1", "Сильная сторона 2"],
    "improvements": ["Рекомендация 1", "Рекомендация 2"]
  }
}

Оценки должны быть реалистичными на основе содержания.
Эффективность оценивай по шкале 0-100:
- Были ли приняты решения?
- Распределены ли задачи?
- Было ли обсуждение конструктивным?
- Не было ли уходов от темы?

Транскрипт:
`

// ============================================
// Analysis Functions
// ============================================

export async function analyzeTranscript(
  transcript: TranscriptData,
  speakers?: SpeakerData[]
): Promise<AnalysisResult> {
  console.log('[Analysis] Starting transcript analysis')

  const model = getGeminiClient()
  const fullText = prepareTranscriptForAnalysis(transcript, speakers)

  if (!fullText || fullText.length < 50) {
    console.log('[Analysis] Transcript too short, generating minimal artifacts')
    return {
      artifacts: [
        {
          type: 'summary',
          content: JSON.stringify({
            summary: 'Транскрипт слишком короткий для полноценного анализа.',
            key_points: [],
            main_topics: [],
            participants_mentioned: [],
          }),
        },
      ],
    }
  }

  // Run all analyses in parallel for speed
  console.log('[Analysis] Running all analyses in parallel...')
  const [summary, protocol, actionItems, analytics] = await Promise.all([
    generateSummary(model, fullText),
    generateProtocol(model, fullText),
    generateActionItems(model, fullText),
    generateAnalytics(model, fullText),
  ])

  const artifacts: ArtifactData[] = []

  if (summary) {
    artifacts.push({
      type: 'summary',
      content: JSON.stringify(summary),
      metadata: { generated_at: new Date().toISOString() },
    })
    console.log('[Analysis] Summary generated successfully')
  }

  if (protocol) {
    artifacts.push({
      type: 'protocol',
      content: JSON.stringify(protocol),
      metadata: { generated_at: new Date().toISOString() },
    })
    console.log('[Analysis] Protocol generated successfully')
  }

  if (actionItems) {
    artifacts.push({
      type: 'action_items',
      content: JSON.stringify(actionItems),
      metadata: {
        generated_at: new Date().toISOString(),
        count: actionItems.action_items.length,
      },
    })
    console.log(`[Analysis] Action items generated: ${actionItems.action_items.length} items`)
  }

  if (analytics) {
    artifacts.push({
      type: 'analytics',
      content: JSON.stringify(analytics),
      metadata: { generated_at: new Date().toISOString() },
    })
    console.log('[Analysis] Analytics generated successfully')
  }

  console.log(`[Analysis] Completed: ${artifacts.length} artifacts generated`)

  return { artifacts }
}

// ============================================
// Transcript Preparation
// ============================================

function prepareTranscriptForAnalysis(
  transcript: TranscriptData,
  speakers?: SpeakerData[]
): string {
  // If we have segments with speaker info, format them nicely
  if (transcript.segments && transcript.segments.length > 0) {
    const speakerNameMap = new Map<string, string>()

    // Build speaker name mapping
    if (speakers) {
      for (const speaker of speakers) {
        const key = `Speaker ${speaker.speaker_index}`
        speakerNameMap.set(key, speaker.name || key)
      }
    }

    // Format transcript with speaker labels
    const formattedSegments = transcript.segments.map(segment => {
      const speakerName = speakerNameMap.get(segment.speaker) || segment.speaker
      const timestamp = formatTimestamp(segment.start)
      return `[${timestamp}] ${speakerName}: ${segment.text}`
    })

    return formattedSegments.join('\n\n')
  }

  // Fallback to full text
  return transcript.full_text
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// ============================================
// Generation Functions
// ============================================

async function generateSummary(
  model: GenerativeModel,
  transcript: string
): Promise<SummaryOutput | null> {
  try {
    console.log('[Analysis] Generating summary...')

    const result = await model.generateContent(SUMMARY_PROMPT + transcript)
    const response = result.response.text()

    return parseJsonResponse<SummaryOutput>(response)
  } catch (error) {
    console.error('[Analysis] Failed to generate summary:', error)
    return null
  }
}

async function generateProtocol(
  model: GenerativeModel,
  transcript: string
): Promise<ProtocolOutput | null> {
  try {
    console.log('[Analysis] Generating protocol...')

    const result = await model.generateContent(PROTOCOL_PROMPT + transcript)
    const response = result.response.text()

    return parseJsonResponse<ProtocolOutput>(response)
  } catch (error) {
    console.error('[Analysis] Failed to generate protocol:', error)
    return null
  }
}

async function generateActionItems(
  model: GenerativeModel,
  transcript: string
): Promise<ActionItemsOutput | null> {
  try {
    console.log('[Analysis] Generating action items...')

    const result = await model.generateContent(ACTION_ITEMS_PROMPT + transcript)
    const response = result.response.text()

    return parseJsonResponse<ActionItemsOutput>(response)
  } catch (error) {
    console.error('[Analysis] Failed to generate action items:', error)
    return null
  }
}

async function generateAnalytics(
  model: GenerativeModel,
  transcript: string
): Promise<AnalyticsOutput | null> {
  try {
    console.log('[Analysis] Generating analytics...')

    const result = await model.generateContent(ANALYTICS_PROMPT + transcript)
    const response = result.response.text()

    return parseJsonResponse<AnalyticsOutput>(response)
  } catch (error) {
    console.error('[Analysis] Failed to generate analytics:', error)
    return null
  }
}

// ============================================
// Utilities
// ============================================

function parseJsonResponse<T>(response: string): T | null {
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
    return JSON.parse(jsonStr) as T
  } catch (error) {
    console.error('[Analysis] Failed to parse JSON response:', error)
    console.error('[Analysis] Raw response (first 500 chars):', response.substring(0, 500))
    return null
  }
}
