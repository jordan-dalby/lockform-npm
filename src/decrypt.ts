import { importPrivateKey, decryptSubmission } from './crypto'
import { DecryptedSubmission, DecryptWebhookOptions } from './types'

export async function decryptWebhookData(options: DecryptWebhookOptions): Promise<DecryptedSubmission> {
  const { payload, privateKey } = options

  const cryptoKey = await importPrivateKey(privateKey)

  const decryptedData = await decryptSubmission(
    payload.ciphertext,
    payload.iv,
    payload.wrapped_key,
    payload.auth_tag,
    cryptoKey
  )

  const rawData: Record<string, unknown> = JSON.parse(decryptedData)

  const mappedData: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(rawData)) {
    const csvName = payload.field_mapping[fieldId]
    if (csvName) {
      mappedData[csvName] = value
    } else {
      mappedData[fieldId] = value
    }
  }

  return {
    rawData,
    mappedData,
    metadata: {
      event_type: payload.event_type,
      submission_id: payload.submission_id,
      form_id: payload.form_id,
      timestamp: payload.timestamp,
      nonce: payload.nonce,
    },
  }
}
