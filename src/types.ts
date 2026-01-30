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
