import { HttpClient } from '../http'
import {
  EncryptedPayload,
  FileSubmissionValue,
  PrepareUploadResponse,
  PublicForm,
  SubmissionCreateInput,
  SubmissionCreateResponse,
  SubmissionFileClaim,
  SubmitFileInput,
  SubmitWithFilesInput,
  SubmitWithFilesResponse,
} from '../../types'
import { encryptFileBlob, encryptSubmission } from '../../encrypt'
import { computeUniqueFieldHash } from '../../blind-index'
import { LockformNetworkError } from '../errors'

export class PublicResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * GET /v1/forms/:formId/public - fetch the public form definition + active
   * encryption key. Authenticated by the per-form access token.
   */
  async getForm(formId: string, accessToken: string): Promise<PublicForm> {
    return this.http.request<PublicForm>({
      method: 'GET',
      path: `/v1/forms/${encodeURIComponent(formId)}/public`,
      query: { token: accessToken },
      skipAuth: true,
    })
  }

  /**
   * POST /v1/forms/:formId/submissions - submit an already-encrypted envelope.
   * Most callers should prefer `submitWithFiles` which handles encryption.
   */
  async submit(
    formId: string,
    accessToken: string,
    input: SubmissionCreateInput
  ): Promise<SubmissionCreateResponse> {
    return this.http.request<SubmissionCreateResponse>({
      method: 'POST',
      path: `/v1/forms/${encodeURIComponent(formId)}/submissions`,
      query: { token: accessToken },
      body: input,
      skipAuth: true,
    })
  }

  /**
   * POST /v1/forms/:formId/files/prepare-upload - request a signed upload URL
   * for an encrypted attachment.
   */
  async prepareUpload(
    formId: string,
    accessToken: string,
    input: { expected_size: number }
  ): Promise<PrepareUploadResponse> {
    return this.http.request<PrepareUploadResponse>({
      method: 'POST',
      path: `/v1/forms/${encodeURIComponent(formId)}/files/prepare-upload`,
      query: { token: accessToken },
      body: input,
      skipAuth: true,
    })
  }

  /**
   * End-to-end submission helper: fetches the public form, encrypts each
   * attachment under a fresh AES-256-GCM key (wrapped into the submission
   * plaintext), uploads each ciphertext blob via a signed URL, encrypts the
   * submission envelope, then POSTs the submission with the resulting
   * `file_claims`.
   */
  async submitWithFiles(
    formId: string,
    accessToken: string,
    input: SubmitWithFilesInput
  ): Promise<SubmitWithFilesResponse> {
    const publicForm = input.publicForm ?? (await this.getForm(formId, accessToken))
    const publicKey = publicForm.public_key

    const files = input.files ?? []
    const fileClaims: SubmissionFileClaim[] = []
    const transformed: Record<string, unknown> = { ...input.data }

    for (const file of files) {
      const plaintextBytes = await toBytes(file.file)
      const plaintextSize = plaintextBytes.byteLength

      const prep = await this.prepareUpload(formId, accessToken, {
        expected_size: plaintextSize,
      })

      const { ciphertext, keyBase64, ivBase64 } = await encryptFileBlob(plaintextBytes)
      await uploadCiphertext(this.http, prep.signed_url, ciphertext)

      const value: FileSubmissionValue = {
        filename: file.filename,
        mime_type: resolveMimeType(file),
        size: plaintextSize,
        storage_path: prep.storage_path,
        file_key: keyBase64,
        file_iv: ivBase64,
      }
      attachFileValue(transformed, file.field, value)

      fileClaims.push({
        upload_token: prep.upload_token,
        storage_path: prep.storage_path,
      })
    }

    const uniqueFieldHash = await resolveUniqueFieldHash(input, publicForm, transformed)

    const envelope: EncryptedPayload = await encryptSubmission(transformed, publicKey, {
      formId,
    })

    const result = await this.submit(formId, accessToken, {
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      salt: envelope.salt,
      ephemeral_public_key: envelope.ephemeralPublicKey,
      algorithm: envelope.algorithm,
      nonce: envelope.nonce,
      timestamp: envelope.timestamp,
      unique_field_hash: uniqueFieldHash ?? undefined,
      file_claims: fileClaims.length > 0 ? fileClaims : undefined,
    })

    return { submission_id: result.submission_id }
  }
}

function resolveMimeType(file: SubmitFileInput): string {
  if (file.contentType) return file.contentType
  if (file.file instanceof Uint8Array) return 'application/octet-stream'
  return file.file.type || 'application/octet-stream'
}

function attachFileValue(
  data: Record<string, unknown>,
  field: string,
  value: FileSubmissionValue
): void {
  const existing = data[field]
  if (existing === undefined) {
    data[field] = value
    return
  }
  if (Array.isArray(existing)) {
    data[field] = [...existing, value]
    return
  }
  data[field] = [existing, value]
}

async function resolveUniqueFieldHash(
  input: SubmitWithFilesInput,
  publicForm: PublicForm,
  data: Record<string, unknown>
): Promise<string | null> {
  if (input.uniqueFieldHash !== undefined) return input.uniqueFieldHash
  const config = publicForm.form.settings?.duplicate_detection
  if (!config || !config.enabled) return null
  return computeUniqueFieldHash(data, config)
}

async function toBytes(input: Blob | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input
  const buf = await input.arrayBuffer()
  return new Uint8Array(buf)
}

async function uploadCiphertext(
  http: HttpClient,
  signedUrl: string,
  ciphertext: Uint8Array
): Promise<void> {
  let response: Response
  try {
    response = await http.rawFetch(signedUrl, {
      method: 'PUT',
      body: toArrayBuffer(ciphertext),
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  } catch (err) {
    throw new LockformNetworkError(
      err instanceof Error ? err.message : 'File upload failed',
      err
    )
  }
  if (!response.ok) {
    throw new LockformNetworkError(
      `File upload failed with status ${response.status}`,
      await safeReadText(response)
    )
  }
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    return await response.text()
  } catch {
    return null
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
