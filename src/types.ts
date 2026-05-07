// =============================================================================
// Existing webhook / decryption types - preserved for backwards compatibility.
// =============================================================================

export interface WebhookPayload {
  event_type: string
  submission_id: string
  form_id: string
  ciphertext: string
  iv: string
  salt: string
  ephemeral_public_key: string
  auth_tag: string
  algorithm: string
  nonce: string
  encryption_timestamp: number
  timestamp: string
  field_mapping: Record<string, string>
}

export interface DecryptedSubmission {
  rawData: Record<string, unknown>
  mappedData: Record<string, unknown>
  metadata: {
    event_type: string
    submission_id: string
    form_id: string
    timestamp: string
    nonce: string
  }
}

export interface DecryptWebhookOptions {
  payload: WebhookPayload
  passphrase: string
}

export interface VerifySignatureOptions {
  payload: string
  signature: string
  secret: string
}

// =============================================================================
// REST client types.
// =============================================================================

export interface HealthResponse {
  status: string
  timestamp: string
  service: string
}

export interface Paginated<T> {
  data: T[]
  next_cursor: string | null
}

// ---- Forms ------------------------------------------------------------------

export interface Form {
  id: string
  organization_id: string
  title: string
  description: string | null
  fields: unknown[]
  submit_button: unknown
  max_width: unknown
  settings: Record<string, unknown>
  is_submissions_disabled: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface PublicForm {
  form: {
    id: string
    organization_id: string
    title: string
    description: string | null
    fields: unknown[]
    submit_button: unknown
    max_width: unknown
    settings: Record<string, unknown>
    created_at: string
    updated_at: string
  }
  public_key: string
  algorithm: string
}

export interface FormCreateInput {
  title: string
  description?: string | null
  fields?: unknown[]
  submit_button?: unknown
  max_width?: unknown
  settings?: Record<string, unknown>
  is_submissions_disabled?: boolean
}

export interface FormUpdateInput {
  title?: string
  description?: string | null
  fields?: unknown[]
  submit_button?: unknown
  max_width?: unknown
  settings?: Record<string, unknown>
  is_submissions_disabled?: boolean
}

export interface FormCloneInput {
  title?: string
  description?: string | null
}

export interface FormCloneResponse {
  success: boolean
  form: Form
  form_url: string | null
  message: string
}

export interface FormListOptions {
  limit?: number
  cursor?: string
}

// ---- Form images ------------------------------------------------------------

export interface FormImageUploadInput {
  /**
   * The image bytes. Accepts Blob/File (browser, Deno, Node 18+) or Uint8Array
   * (which the client wraps in a Blob internally).
   */
  file: Blob | Uint8Array
  contentType: string
  filename?: string
}

export interface FormImageUploadResponse {
  url: string
  path: string
  reused: boolean
}

// ---- Access tokens ----------------------------------------------------------

export interface AccessToken {
  id: string
  form_id: string
  label: string | null
  is_active: boolean
  expires_at: string | null
  created_at: string
  /** Only present in the response of `create()`. */
  token?: string
}

export interface AccessTokenCreateInput {
  label?: string | null
  expires_at?: string | null
}

export interface AccessTokenUpdateInput {
  label?: string | null
  is_active?: boolean
  expires_at?: string | null
}

// ---- Webhooks ---------------------------------------------------------------

export interface Webhook {
  id: string
  form_id: string
  url: string
  enabled: boolean
  secret: string | null
  created_at: string
  updated_at: string
}

export interface WebhookPutInput {
  url: string
  enabled?: boolean
  secret?: string | null
}

export interface WebhookTestResponse {
  delivered: boolean
  url: string
  status: number | null
  error?: string
}

// ---- Submissions ------------------------------------------------------------

export interface Submission {
  id: string
  form_id: string
  ciphertext: string
  iv: string
  salt: string
  ephemeral_public_key: string
  auth_tag: string
  algorithm: string
  nonce: string
  encryption_timestamp: number
  unique_field_hash: string | null
  submitter_ip: string | null
  user_agent: string | null
  submitted_at: string
  [key: string]: unknown
}

export interface SubmissionListOptions {
  limit?: number
  cursor?: string
  from?: string
  to?: string
}

export interface SubmissionEnvelope {
  ciphertext: string
  iv: string
  salt: string
  ephemeral_public_key: string
  algorithm: string
  nonce: string
  timestamp: number
  unique_field_hash?: string | null
}

export interface SubmissionFileClaim {
  upload_token: string
  storage_path: string
}

export interface SubmissionCreateInput extends SubmissionEnvelope {
  file_claims?: SubmissionFileClaim[]
}

export interface SubmissionCreateResponse {
  success: boolean
  submission_id: string
  message: string
}

export interface SubmissionCountResponse {
  count: number
}

export interface SubmissionBulkDeleteResponse {
  deleted: number
}

// ---- Files ------------------------------------------------------------------

export interface PrepareUploadInput {
  expected_size: number
}

export interface PrepareUploadResponse {
  signed_url: string
  storage_path: string
  upload_token: string
  expires_in_seconds: number
}

export interface PrepareDownloadResponse {
  signed_url: string
  expires_in_seconds: number
}

// ---- Encryption -------------------------------------------------------------

export interface EncryptedPayload {
  ciphertext: string
  iv: string
  salt: string
  ephemeralPublicKey: string
  algorithm: 'X25519+AES-256-GCM'
  nonce: string
  timestamp: number
}

export interface EncryptSubmissionMetadata {
  formId?: string
  timestamp?: number
}

// ---- submitWithFiles helper -------------------------------------------------

export interface SubmitFileInput {
  /** The plaintext file bytes. */
  file: Blob | Uint8Array
  /** The form field id (or CSV name) this file is attached to. */
  field: string
  filename?: string
  contentType?: string
}

export interface SubmitWithFilesInput {
  data: Record<string, unknown>
  files?: SubmitFileInput[]
  /**
   * Optional pre-fetched public form definition. When omitted the helper
   * fetches it via `public.getForm`.
   */
  publicForm?: PublicForm
  /**
   * Optional value to base the `unique_field_hash` on. Caller must supply
   * the already-hashed value (mirrors the dashboard form-runtime). Omit if
   * the form has no duplicate-detection rule.
   */
  uniqueFieldHash?: string | null
}

export interface SubmitWithFilesResponse {
  submission_id: string
}
