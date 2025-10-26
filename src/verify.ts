import { createHmacSignature } from './crypto'
import { VerifySignatureOptions } from './types'

export async function verifyWebhookSignature(options: VerifySignatureOptions): Promise<boolean> {
  const { payload, signature, secret } = options

  const expectedSignature = await createHmacSignature(payload, secret)

  return expectedSignature === signature
}
