export class LockformError extends Error {
  status: number
  details?: unknown
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'LockformError'
    this.status = status
    this.body = body
    if (body && typeof body === 'object' && 'details' in body) {
      this.details = (body as { details?: unknown }).details
    }
  }
}

export class LockformAuthError extends LockformError {
  constructor(message: string, status: number, body: unknown) {
    super(message, status, body)
    this.name = 'LockformAuthError'
  }
}

export class LockformNotFoundError extends LockformError {
  constructor(message: string, status: number, body: unknown) {
    super(message, status, body)
    this.name = 'LockformNotFoundError'
  }
}

export class LockformValidationError extends LockformError {
  constructor(message: string, status: number, body: unknown) {
    super(message, status, body)
    this.name = 'LockformValidationError'
  }
}

export class LockformRateLimitError extends LockformError {
  constructor(message: string, status: number, body: unknown) {
    super(message, status, body)
    this.name = 'LockformRateLimitError'
  }
}

export class LockformServerError extends LockformError {
  constructor(message: string, status: number, body: unknown) {
    super(message, status, body)
    this.name = 'LockformServerError'
  }
}

export class LockformNetworkError extends Error {
  cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'LockformNetworkError'
    this.cause = cause
  }
}

export function errorFromResponse(status: number, body: unknown): LockformError {
  const message = extractMessage(body) ?? `Lockform API error (${status})`
  if (status === 401 || status === 403) return new LockformAuthError(message, status, body)
  if (status === 404) return new LockformNotFoundError(message, status, body)
  if (status === 400) return new LockformValidationError(message, status, body)
  if (status === 429) return new LockformRateLimitError(message, status, body)
  if (status >= 500) return new LockformServerError(message, status, body)
  return new LockformError(message, status, body)
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  if (typeof obj.error === 'string') return obj.error
  if (typeof obj.message === 'string') return obj.message
  return null
}
