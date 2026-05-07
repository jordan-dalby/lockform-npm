/**
 * X25519 + AES-256-GCM hybrid encryption.
 *
 * Wire-format-compatible with `Lockform/src/lib/crypto/encryption.ts` - every
 * byte (algorithm tag, HKDF info string, IV/salt/nonce sizes, AAD format)
 * matches so dashboard-encrypted and SDK-encrypted submissions decrypt
 * identically.
 */

import { x25519 } from '@noble/curves/ed25519'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { base64ToBytes, bytesToBase64 } from './util/base64'
import { importPublicKeyBase64 } from './keys'
import { EncryptedPayload, EncryptSubmissionMetadata } from './types'

function generateNonce(): string {
  const array = new Uint8Array(16)
  globalThis.crypto.getRandomValues(array)
  return bytesToBase64(array)
}

function generateIV(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(12))
}

function generateSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32))
}

function generateEphemeralKeyPair(): {
  privateKey: Uint8Array
  publicKey: Uint8Array
} {
  const privateKey = x25519.utils.randomSecretKey()
  const publicKey = x25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

function deriveSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey)
}

function deriveAESKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  const info = new TextEncoder().encode('lockform-encryption-v1')
  return hkdf(sha256, sharedSecret, salt, info, 32)
}

async function encryptWithAES(
  data: string,
  key: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array
): Promise<ArrayBuffer> {
  const dataBuffer = new TextEncoder().encode(data)
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  return globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      ...(additionalData && { additionalData: additionalData as BufferSource }),
    },
    cryptoKey,
    dataBuffer as BufferSource
  )
}

export async function encryptSubmission(
  data: unknown,
  publicKeyBase64: string,
  metadata?: EncryptSubmissionMetadata
): Promise<EncryptedPayload> {
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data)
  const recipientPublicKey = importPublicKeyBase64(publicKeyBase64)

  const { privateKey: ephemeralPrivateKey, publicKey: ephemeralPublicKey } =
    generateEphemeralKeyPair()

  const sharedSecret = deriveSharedSecret(ephemeralPrivateKey, recipientPublicKey)

  const iv = generateIV()
  const salt = generateSalt()
  const aesKey = deriveAESKey(sharedSecret, salt)

  const timestamp = metadata?.timestamp ?? Date.now()
  const aad = metadata
    ? new TextEncoder().encode(`${metadata.formId ?? ''}:${timestamp}`)
    : undefined

  const ciphertext = await encryptWithAES(plaintext, aesKey, iv, aad)

  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    ephemeralPublicKey: bytesToBase64(ephemeralPublicKey),
    algorithm: 'X25519+AES-256-GCM',
    nonce: generateNonce(),
    timestamp,
  }
}

export function validateEncryptedPayload(payload: unknown): payload is EncryptedPayload {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.ciphertext === 'string' &&
    typeof p.iv === 'string' &&
    typeof p.salt === 'string' &&
    typeof p.ephemeralPublicKey === 'string' &&
    p.algorithm === 'X25519+AES-256-GCM' &&
    typeof p.nonce === 'string' &&
    typeof p.timestamp === 'number'
  )
}

/**
 * AES-256-GCM symmetric encryption with a fresh per-call key + IV. Used for
 * file attachments: the per-file key is wrapped into the submission plaintext
 * so the recipient can decrypt files after decrypting the submission envelope.
 */
export async function encryptFileBlob(bytes: Uint8Array): Promise<{
  ciphertext: Uint8Array
  keyBase64: string
  ivBase64: string
}> {
  const key = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cryptoKey,
    toArrayBuffer(bytes)
  )
  return {
    ciphertext: new Uint8Array(ct),
    keyBase64: bytesToBase64(key),
    ivBase64: bytesToBase64(iv),
  }
}

export { base64ToBytes, bytesToBase64 }

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
