import { HttpClient, FetchLike, AuthMode } from './http'
import { FormsResource } from './resources/forms'
import { AccessTokensResource } from './resources/accessTokens'
import { WebhooksResource } from './resources/webhooks'
import { SubmissionsResource } from './resources/submissions'
import { FilesResource } from './resources/files'
import { PublicResource } from './resources/public'
import { PrefillLinksResource } from './resources/prefillLinks'
import { HealthResponse } from '../types'

export interface LockformConfig {
  apiKey?: string
  jwt?: string
  organizationId?: string
  baseUrl?: string
  fetch?: FetchLike
  headers?: Record<string, string>
}

const DEFAULT_BASE_URL = 'https://api.lockform.io'

export class Lockform {
  readonly forms: FormsResource
  readonly accessTokens: AccessTokensResource
  readonly webhooks: WebhooksResource
  readonly submissions: SubmissionsResource
  readonly files: FilesResource
  readonly public: PublicResource
  readonly prefillLinks: PrefillLinksResource

  private readonly http: HttpClient

  constructor(config: LockformConfig = {}) {
    const auth = resolveAuth(config)
    const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis)
    if (!fetchImpl) {
      throw new Error(
        'No fetch implementation available. Provide one via the `fetch` option ' +
          'or run on a platform that exposes `globalThis.fetch` (Node 18+, Deno, Workers, browsers).'
      )
    }

    this.http = new HttpClient({
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      auth,
      fetch: fetchImpl,
      headers: config.headers,
    })

    this.forms = new FormsResource(this.http)
    this.accessTokens = new AccessTokensResource(this.http)
    this.webhooks = new WebhooksResource(this.http)
    this.submissions = new SubmissionsResource(this.http)
    this.files = new FilesResource(this.http)
    this.public = new PublicResource(this.http)
    this.prefillLinks = new PrefillLinksResource(this.http)
  }

  health(): Promise<HealthResponse> {
    return this.http.request<HealthResponse>({
      method: 'GET',
      path: '/health',
      skipAuth: true,
    })
  }
}

function resolveAuth(config: LockformConfig): AuthMode {
  const hasApiKey = typeof config.apiKey === 'string' && config.apiKey.length > 0
  const hasJwt = typeof config.jwt === 'string' && config.jwt.length > 0
  if (hasApiKey && hasJwt) {
    throw new Error('Provide either `apiKey` or `jwt`, not both.')
  }
  if (hasApiKey) {
    return { type: 'apiKey', apiKey: config.apiKey as string }
  }
  if (hasJwt) {
    if (!config.organizationId) {
      throw new Error('`organizationId` is required when authenticating with `jwt`.')
    }
    return { type: 'jwt', jwt: config.jwt as string, organizationId: config.organizationId }
  }
  return { type: 'none' }
}
