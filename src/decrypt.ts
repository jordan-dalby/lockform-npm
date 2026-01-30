import { importPrivateKeyFromMnemonic, importPrivateKeyFromBase64, decryptSubmission } from './crypto'
import { DecryptedSubmission, DecryptWebhookOptions } from './types'

export async function decryptWebhookData(options: DecryptWebhookOptions): Promise<DecryptedSubmission> {
  const { payload, passphrase } = options

  let privateKeyBytes: Uint8Array

  if (passphrase.includes(' ')) {
    privateKeyBytes = importPrivateKeyFromMnemonic(passphrase)
  } else {
    privateKeyBytes = importPrivateKeyFromBase64(passphrase)
  }

  const decryptedData = await decryptSubmission(
    payload.ciphertext,
    payload.iv,
    payload.salt,
    payload.ephemeral_public_key,
    privateKeyBytes,
    {
      formId: payload.form_id,
      encryptionTimestamp: payload.encryption_timestamp,
    }
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
