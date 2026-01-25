import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import type { ArtifactData, TranscriptData } from './webhook.js'

// ============================================
// Types
// ============================================

export interface AnalysisResult {
  artifacts: ArtifactData[]
}

interface SummaryOutput {
  summary: string
  key_points: string[]
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
  next_steps: string[]
}

interface ActionItemsOutput {
  action_items: Array<{
    task: string
    assignee: string | null
    deadline: string | null
    priority: 'high' | 'medium' | 'low'
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
    model: 'gemini-1.5-pro',
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 8192,
    },
  })
}

// ============================================
// Prompts
// ============================================

const SUMMARY_PROMPT = `Analyze the following meeting transcript and provide a structured summary.

Your response must be valid JSON with this exact structure:
{
  "summary": "A comprehensive 2-3 paragraph summary of the meeting",
  "key_points": ["Key point 1", "Key point 2", ...],
  "participants_mentioned": ["Name 1", "Name 2", ...]
}

Focus on:
- Main topics discussed
- Key decisions made
- Important points raised
- Any deadlines or commitments mentioned

Transcript:
`

const PROTOCOL_PROMPT = `Create a formal meeting protocol from the following transcript.

Your response must be valid JSON with this exact structure:
{
  "title": "Meeting title based on content",
  "date": "Date mentioned or 'Not specified'",
  "participants": ["Participant 1", "Participant 2", ...],
  "agenda": ["Agenda item 1", "Agenda item 2", ...],
  "discussion": [
    {
      "topic": "Topic name",
      "summary": "Summary of discussion",
      "decisions": ["Decision 1", "Decision 2"]
    }
  ],
  "next_steps": ["Next step 1", "Next step 2", ...]
}

Be formal and professional in tone.

Transcript:
`

const ACTION_ITEMS_PROMPT = `Extract all action items from the following meeting transcript.

Your response must be valid JSON with this exact structure:
{
  "action_items": [
    {
      "task": "Description of the task",
      "assignee": "Name of person responsible or null if not specified",
      "deadline": "Deadline mentioned or null if not specified",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Look for:
- Explicit assignments ("John will...", "We need to...")
- Commitments made by participants
- Follow-up tasks mentioned
- Deadlines or timeframes

Transcript:
`

const ANALYTICS_PROMPT = `Analyze the following meeting transcript and provide detailed analytics.

Your response must be valid JSON with this exact structure:
{
  "speaking_time_distribution": {
    "Speaker 1": 35,
    "Speaker 2": 45,
    "Others": 20
  },
  "topics_discussed": [
    {
      "topic": "Topic name",
      "duration_percentage": 25
    }
  ],
  "sentiment_overview": {
    "overall": "positive" | "neutral" | "negative",
    "key_moments": [
      {
        "timestamp": "Approximate time or segment reference",
        "sentiment": "positive/negative/neutral",
        "context": "Brief description"
      }
    ]
  },
  "engagement_metrics": {
    "question_count": 5,
    "decision_count": 3,
    "action_items_count": 7
  }
}

Provide realistic estimates based on the content.

Transcript:
`

// ============================================
// Analysis Functions
// ============================================

export async function analyzeTranscript(transcript: TranscriptData): Promise<AnalysisResult> {
  console.log('[Analysis] Starting transcript analysis')

  const model = getGeminiClient()
  const fullText = transcript.full_text

  if (!fullText || fullText.length < 50) {
    console.log('[Analysis] Transcript too short, generating minimal artifacts')
    return {
      artifacts: [
        {
          type: 'summary',
          content: JSON.stringify({
            summary: 'Transcript is too short for meaningful analysis.',
            key_points: [],
            participants_mentioned: [],
          }),
        },
      ],
    }
  }

  // Run all analyses in parallel
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
  }

  if (protocol) {
    artifacts.push({
      type: 'protocol',
      content: JSON.stringify(protocol),
      metadata: { generated_at: new Date().toISOString() },
    })
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
  }

  if (analytics) {
    artifacts.push({
      type: 'analytics',
      content: JSON.stringify(analytics),
      metadata: { generated_at: new Date().toISOString() },
    })
  }

  console.log(`[Analysis] Generated ${artifacts.length} artifacts`)

  return { artifacts }
}

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
  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = response.trim()

  // Remove markdown code block if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  try {
    return JSON.parse(jsonStr) as T
  } catch (error) {
    console.error('[Analysis] Failed to parse JSON response:', error)
    console.error('[Analysis] Raw response:', response.substring(0, 500))
    return null
  }
}
