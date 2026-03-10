// Database types
export * from './database'

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Upload types
export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}
