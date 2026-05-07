import { HttpClient } from '../http'
import {
  EncryptedPayload,
  PrepareUploadResponse,
  PublicForm,
  SubmissionCreateInput,
  SubmissionCreateResponse,
  SubmissionFileClaim,
  SubmitWithFilesInput,
  SubmitWithFilesResponse,
} from '../../types'
import { encryptFileBlob, encryptSubmission } from '../../encrypt'
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
    const fileMeta: Array<{
      field: string
      filename: string | null
      contentType: string | null
      keyBase64: string
      ivBase64: string
      storage_path: string
      upload_token: string
    }> = []

    for (const file of files) {
      const plaintextBytes = await toBytes(file.file)
      const { ciphertext, keyBase64, ivBase64 } = await encryptFileBlob(plaintextBytes)

      const prep = await this.prepareUpload(formId, accessToken, {
        expected_size: ciphertext.byteLength,
      })

      await uploadCiphertext(this.http, prep.signed_url, ciphertext)

      fileClaims.push({
        upload_token: prep.upload_token,
        storage_path: prep.storage_path,
      })
      fileMeta.push({
        field: file.field,
        filename: file.filename ?? null,
        contentType: file.contentType ?? null,
        keyBase64,
        ivBase64,
        storage_path: prep.storage_path,
        upload_token: prep.upload_token,
      })
    }

    const plaintext: Record<string, unknown> = { ...input.data }
    if (fileMeta.length > 0) {
      plaintext.__lockform_files = fileMeta
    }

    const envelope: EncryptedPayload = await encryptSubmission(plaintext, publicKey, {
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
      unique_field_hash: input.uniqueFieldHash ?? undefined,
      file_claims: fileClaims.length > 0 ? fileClaims : undefined,
    })

    return { submission_id: result.submission_id }
  }
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
