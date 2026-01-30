# Lockform

Official SDK for processing Lockform webhook submissions with end-to-end encryption using X25519 + AES-256-GCM.

## Installation

```bash
npm install lockform
```

## Features

- **Decrypt webhook data**: Easily decrypt encrypted form submissions received via webhooks
- **Signature verification**: Verify webhook authenticity using HMAC-SHA256 signatures
- **Field mapping**: Automatically map field IDs to human-readable CSV names
- **X25519 encryption**: Modern, fast elliptic curve cryptography
- **BIP39 support**: Works with 15-word recovery phrases or base64 private keys
- **TypeScript support**: Full type definitions included

## Quick Start

### Decrypting Webhook Data

You can decrypt webhooks using either your 15-word recovery phrase or a base64-encoded private key:

**Using recovery phrase:**

```typescript
import { decryptWebhookData } from 'lockform'

const mnemonic = 'your fifteen word recovery phrase goes here and must be exactly fifteen words'

app.post('/webhook', async (req, res) => {
  const payload = req.body

  const result = await decryptWebhookData({
    payload,
    passphrase: mnemonic,
  })

  console.log('Mapped data:', result.mappedData)
  res.json({ success: true })
})
```

**Using base64 private key:**

```typescript
import { decryptWebhookData } from 'lockform'

const privateKeyBase64 = 'your-base64-encoded-x25519-private-key'

app.post('/webhook', async (req, res) => {
  const payload = req.body

  const result = await decryptWebhookData({
    payload,
    passphrase: privateKeyBase64,
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
    passphrase: process.env.LOCKFORM_RECOVERY_PHRASE,
  })

  console.log('Decrypted data:', result.mappedData)
  res.json({ success: true })
})
```

## API Reference

### `decryptWebhookData(options)`

Decrypts an encrypted webhook payload from Lockform using X25519 + AES-256-GCM.

**Parameters:**
- `options.payload` (WebhookPayload): The webhook payload received from Lockform
- `options.passphrase` (string): Your 15-word BIP39 recovery phrase (or optionally, base64-encoded X25519 private key)

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
  passphrase: myRecoveryPhrase,
})

console.log(result.mappedData) // { name: "John Doe", email: "john@example.com" }
console.log(result.rawData) // { "field-id-1": "John Doe", "field-id-2": "john@example.com" }
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
  salt: string
  ephemeral_public_key: string
  auth_tag: string
  algorithm: string
  nonce: string
  encryption_timestamp: number
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

### Node.js / Express

```typescript
import express from 'express'
import { decryptWebhookData, verifyWebhookSignature } from 'lockform'

const app = express()
app.use(express.json())

const RECOVERY_PHRASE = process.env.LOCKFORM_RECOVERY_PHRASE
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
      passphrase: RECOVERY_PHRASE,
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

### Deno Edge Function

```typescript
import { decryptWebhookData, verifyWebhookSignature, type WebhookPayload } from 'lockform'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const recoveryPhrase = Deno.env.get('LOCKFORM_RECOVERY_PHRASE')
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')

  if (!recoveryPhrase) {
    return new Response(
      JSON.stringify({ error: 'Recovery phrase not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const signature = req.headers.get('x-signature-sha256')
  const rawBody = await req.text()
  const payload: WebhookPayload = JSON.parse(rawBody)

  if (webhookSecret && signature) {
    const isValid = await verifyWebhookSignature({
      payload: rawBody,
      signature,
      secret: webhookSecret,
    })
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  const result = await decryptWebhookData({
    payload,
    passphrase: recoveryPhrase,
  })

  console.log('New submission:', result.mappedData)

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
```

## Cryptographic Details

Lockform uses modern, audited cryptography for maximum security:

- **Key Exchange**: X25519 (Curve25519 Diffie-Hellman)
- **Symmetric Encryption**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: HKDF-SHA256 with separate salt
- **Mnemonic-to-Key**: PBKDF2-SHA512 (600,000 iterations)
- **Mnemonic**: BIP39 (15 words, 160 bits entropy)

**Why X25519 instead of RSA?**
- Smaller keys (32 bytes vs 4096 bits)
- Faster operations
- Better security per bit
- Modern, constant-time implementation
- Forward secrecy with ephemeral keys

## Security Best Practices

1. **Always verify signatures**: Use `verifyWebhookSignature` to ensure webhooks are genuinely from Lockform
2. **Protect your recovery phrase**: Store your 15-word recovery phrase in environment variables, never commit it to version control
3. **Never share your recovery phrase**: Anyone with your 15-word recovery phrase can decrypt all submissions
4. **Use HTTPS**: Always use HTTPS endpoints for webhooks in production
5. **Validate data**: Always validate the decrypted data before processing it
6. **Implement idempotency**: Use the `submission_id` to prevent duplicate processing
7. **Rate limiting**: Implement rate limiting on your webhook endpoint

## Migration from v1.x (RSA) to v2.x (X25519)

If you're migrating from the RSA-based v1.x version:

1. **Update your package**: `npm install lockform@latest`
2. **Update your credentials**: Use your 15-word recovery phrase instead of PEM-formatted RSA keys
3. **Update your code**: Pass your recovery phrase as the `passphrase` parameter (renamed from `privateKey`)

The webhook payload structure has changed:
- `wrapped_key` → `ephemeral_public_key`
- Added: `salt`, `encryption_timestamp`
- `algorithm` changed from `RSA-OAEP-4096+AES-256-GCM` to `X25519+AES-256-GCM`

## Requirements

- Node.js 18.0.0 or higher
- TypeScript 5.0.0 or higher (for TypeScript projects)

## License

MIT
