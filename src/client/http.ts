import { errorFromResponse, LockformNetworkError } from './errors'

export type FetchLike = typeof fetch

export type AuthMode =
  | { type: 'apiKey'; apiKey: string }
  | { type: 'jwt'; jwt: string; organizationId: string }
  | { type: 'none' }

export interface HttpClientConfig {
  baseUrl: string
  auth: AuthMode
  fetch: FetchLike
  headers?: Record<string, string>
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string | number | undefined | null>
  body?: unknown
  multipart?: FormData
  headers?: Record<string, string>
  /**
   * Skip the configured auth + JWT org-id injection. Used by access-token
   * routes (`lf.public.*`) which carry their own credentials.
   */
  skipAuth?: boolean
}

const JSON_CONTENT_TYPE = 'application/json'

export class HttpClient {
  private readonly baseUrl: string
  private readonly auth: AuthMode
  private readonly fetchImpl: FetchLike
  private readonly extraHeaders: Record<string, string>

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.auth = config.auth
    this.fetchImpl = config.fetch
    this.extraHeaders = config.headers ?? {}
  }

  get authMode(): AuthMode['type'] {
    return this.auth.type
  }

  /**
   * Raw fetch using the configured implementation. Used for one-off requests
   * that don't go through the Lockform API (e.g. PUTting to a Supabase
   * Storage signed URL).
   */
  rawFetch(url: string, init?: RequestInit): Promise<Response> {
    return this.fetchImpl(url, init)
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options)
    const headers: Record<string, string> = { ...this.extraHeaders, ...options.headers }
    let body: BodyInit | undefined

    if (!options.skipAuth) this.applyAuthHeader(headers)

    if (options.multipart) {
      body = options.multipart
    } else if (options.body !== undefined) {
      const payload = options.skipAuth ? options.body : this.injectOrgIdIntoBody(options.body)
      headers['Content-Type'] = JSON_CONTENT_TYPE
      body = JSON.stringify(payload)
    }

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body,
      })
    } catch (err) {
      throw new LockformNetworkError(
        err instanceof Error ? err.message : 'Network request failed',
        err
      )
    }

    return this.parseResponse<T>(response)
  }

  private buildUrl(options: RequestOptions): string {
    const path = options.path.startsWith('/') ? options.path : `/${options.path}`
    const url = new URL(`${this.baseUrl}${path}`)

    const query = { ...(options.query ?? {}) }
    if (
      !options.skipAuth &&
      this.auth.type === 'jwt' &&
      this.shouldInjectOrgIdQuery(options) &&
      query.organization_id == null
    ) {
      query.organization_id = this.auth.organizationId
    }

    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
    return url.toString()
  }

  private shouldInjectOrgIdQuery(options: RequestOptions): boolean {
    // For body-bearing requests we inject into the body instead.
    return options.body === undefined && options.multipart === undefined
  }

  private applyAuthHeader(headers: Record<string, string>): void {
    if (this.auth.type === 'apiKey') {
      headers['Authorization'] = `Bearer ${this.auth.apiKey}`
    } else if (this.auth.type === 'jwt') {
      headers['Authorization'] = `Bearer ${this.auth.jwt}`
    }
  }

  private injectOrgIdIntoBody(body: unknown): unknown {
    if (this.auth.type !== 'jwt') return body
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return body
    const obj = body as Record<string, unknown>
    if ('organization_id' in obj) return obj
    return { ...obj, organization_id: this.auth.organizationId }
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (response.status === 204) return null as T
    const text = await response.text()
    let parsed: unknown = null
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }
    if (!response.ok) {
      throw errorFromResponse(response.status, parsed)
    }
    return parsed as T
  }
}
