# Lockform

Official SDK for processing Lockform webhook submissions with end-to-end encryption.

## Installation

```bash
npm install lockform
```

## Features

- **Decrypt webhook data**: Easily decrypt encrypted form submissions received via webhooks
- **Signature verification**: Verify webhook authenticity using HMAC-SHA256 signatures
- **Field mapping**: Automatically map field IDs to human-readable CSV names
- **TypeScript support**: Full type definitions included

## Quick Start

### Decrypting Webhook Data

```typescript
import { decryptWebhookData } from 'lockform'

const privateKey = `-----BEGIN PRIVATE KEY-----
YOUR_PRIVATE_KEY_HERE
-----END PRIVATE KEY-----`

app.post('/webhook', async (req, res) => {
  const payload = req.body

  const result = await decryptWebhookData({
    payload,
    privateKey,
  })

  console.log('Mapped data:', result.mappedData)

  res.json({ success: true })
})
```

### Verifying Webhook Signatures

```typescript
import { verifyWebhookSignature, decryptWebhookData } from 'lockform'

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-signature-sha256']
  const webhookSecret = process.env.WEBHOOK_SECRET

  const isValid = await verifyWebhookSignature({
    payload: JSON.stringify(req.body),
    signature,
    secret: webhookSecret,
  })

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const result = await decryptWebhookData({
    payload: req.body,
    privateKey: process.env.PRIVATE_KEY,
  })

  console.log('Decrypted data:', result.mappedData)

  res.json({ success: true })
})
```

## API Reference

### `decryptWebhookData(options)`

Decrypts an encrypted webhook payload from Lockform.

**Parameters:**
- `options.payload` (WebhookPayload): The webhook payload received from Lockform
- `options.privateKey` (string): Your RSA private key in PEM format

**Returns:** `Promise<DecryptedSubmission>`

```typescript
{
  rawData: Record<string, unknown>,      // Decrypted data with field IDs as keys
  mappedData: Record<string, unknown>,   // Decrypted data with CSV names as keys
  metadata: {
    event_type: string,
    submission_id: string,
    form_id: string,
    timestamp: string,
    nonce: string,
  }
}
```

**Example:**

```typescript
const result = await decryptWebhookData({
  payload: webhookPayload,
  privateKey: myPrivateKey,
})

console.log(result.mappedData)
```

### `verifyWebhookSignature(options)`

Verifies the HMAC-SHA256 signature of a webhook payload.

**Parameters:**
- `options.payload` (string): The raw JSON string of the webhook payload
- `options.signature` (string): The signature from the `X-Signature-SHA256` header
- `options.secret` (string): Your webhook secret

**Returns:** `Promise<boolean>` - `true` if the signature is valid, `false` otherwise

**Example:**

```typescript
const isValid = await verifyWebhookSignature({
  payload: JSON.stringify(req.body),
  signature: req.headers['x-signature-sha256'],
  secret: process.env.WEBHOOK_SECRET,
})

if (!isValid) {
  throw new Error('Invalid webhook signature')
}
```

## Types

### WebhookPayload

```typescript
interface WebhookPayload {
  event_type: string
  submission_id: string
  form_id: string
  ciphertext: string
  iv: string
  wrapped_key: string
  auth_tag: string
  algorithm: string
  nonce: string
  timestamp: string
  field_mapping: Record<string, string>
}
```

### DecryptedSubmission

```typescript
interface DecryptedSubmission {
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
```

## Complete Example

```typescript
import express from 'express'
import { decryptWebhookData, verifyWebhookSignature } from 'lockform'

const app = express()
app.use(express.json())

const PRIVATE_KEY = process.env.LOCKFORM_PRIVATE_KEY
const WEBHOOK_SECRET = process.env.LOCKFORM_WEBHOOK_SECRET

app.post('/lockform-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-signature-sha256'] as string
    const payload = req.body

    if (WEBHOOK_SECRET && signature) {
      const isValid = await verifyWebhookSignature({
        payload: JSON.stringify(payload),
        signature,
        secret: WEBHOOK_SECRET,
      })

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' })
      }
    }

    const result = await decryptWebhookData({
      payload,
      privateKey: PRIVATE_KEY,
    })

    console.log('Form ID:', result.metadata.form_id)
    console.log('Submission ID:', result.metadata.submission_id)
    console.log('Data:', result.mappedData)

    res.json({ success: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    res.status(500).json({ error: 'Failed to process webhook' })
  }
})

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000')
})
```

## Security Best Practices

1. **Always verify signatures**: Use `verifyWebhookSignature` to ensure webhooks are genuinely from Lockform
2. **Keep private keys secure**: Store your private key in environment variables, never commit it to version control
3. **Use HTTPS**: Always use HTTPS endpoints for webhooks in production
4. **Validate data**: Always validate the decrypted data before processing it

## Requirements

- Node.js 18.0.0 or higher
- TypeScript 5.0.0 or higher (for TypeScript projects)

## License

MIT
