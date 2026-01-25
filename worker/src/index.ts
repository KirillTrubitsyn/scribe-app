import express, { Request, Response, NextFunction } from 'express'
import {
  processRecording,
  isValidProcessingRequest,
  getJobStatus,
  getAllActiveJobs,
} from './processor.js'

// ============================================
// Express App Setup
// ============================================

const app = express()

// Middleware
app.use(express.json({ limit: '10mb' }))

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ============================================
// Authentication Middleware
// ============================================

function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  const expectedSecret = process.env.RAILWAY_WEBHOOK_SECRET

  if (!expectedSecret) {
    console.error('RAILWAY_WEBHOOK_SECRET not configured')
    res.status(500).json({ error: 'Server configuration error' })
    return
  }

  // Support both "Bearer <token>" and direct token
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader

  // Also check legacy x-webhook-secret header
  const legacySecret = req.headers['x-webhook-secret']

  if (token !== expectedSecret && legacySecret !== expectedSecret) {
    console.error('Authentication failed')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}

// ============================================
// Routes
// ============================================

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

// Process recording endpoint
app.post('/process', authenticate, async (req: Request, res: Response) => {
  try {
    // Validate request body
    if (!isValidProcessingRequest(req.body)) {
      res.status(400).json({
        error: 'Invalid request body',
        required: ['recording_id', 'gcs_uri', 'organization_id', 'file_name', 'file_size'],
      })
      return
    }

    const { recording_id, gcs_uri, organization_id, file_name, file_size } = req.body

    console.log(`[API] Received processing request for recording ${recording_id}`)

    // Check if already processing
    const existingJob = getJobStatus(recording_id)
    if (existingJob && (existingJob.status === 'processing' || existingJob.status === 'transcribing' || existingJob.status === 'analyzing')) {
      res.status(409).json({
        error: 'Recording is already being processed',
        status: existingJob,
      })
      return
    }

    // Start processing asynchronously
    processRecording({
      recording_id,
      gcs_uri,
      organization_id,
      file_name,
      file_size,
    }).catch(error => {
      console.error(`[API] Background processing failed for ${recording_id}:`, error)
    })

    // Return immediately with accepted status
    res.status(202).json({
      status: 'accepted',
      recording_id,
      message: 'Processing started',
    })
  } catch (error) {
    console.error('[API] Error handling /process request:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get job status endpoint
app.get('/status/:recordingId', authenticate, (req: Request, res: Response) => {
  const { recordingId } = req.params

  const status = getJobStatus(recordingId)

  if (!status) {
    res.status(404).json({
      error: 'Job not found',
      recording_id: recordingId,
    })
    return
  }

  res.json(status)
})

// List all active jobs endpoint
app.get('/jobs', authenticate, (_req: Request, res: Response) => {
  const jobs = getAllActiveJobs()

  res.json({
    count: jobs.length,
    jobs,
  })
})

// ============================================
// Error Handling
// ============================================

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API] Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// ============================================
// Server Startup
// ============================================

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`[Worker] Server started on port ${PORT}`)
  console.log(`[Worker] Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`[Worker] Health check: http://localhost:${PORT}/health`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT received, shutting down gracefully')
  process.exit(0)
})
