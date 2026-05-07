import { x25519 } from '@noble/curves/ed25519'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha512 } from '@noble/hashes/sha2'
import { mnemonicToSeedSync } from 'bip39'
import { base64ToBytes, bytesToBase64 } from './util/base64'

export async function base64ToArrayBuffer(base64: string): Promise<Uint8Array> {
  return base64ToBytes(base64)
}

export function arrayBufferToString(buffer: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(buffer)
}

export function importPrivateKeyFromMnemonic(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic)
  const privateKey = pbkdf2(sha512, seed, 'lockform-x25519-v1', {
    c: 600_000,
    dkLen: 32,
  })
  return privateKey
}

export function importPrivateKeyFromBase64(base64: string): Uint8Array {
  return base64ToBytes(base64)
}

export function derivePrivateKey(mnemonic: string): string {
  const privateKeyBytes = importPrivateKeyFromMnemonic(mnemonic)
  return bytesToBase64(privateKeyBytes)
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

async function decryptWithAES(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array
): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      ...(additionalData && { additionalData: additionalData as BufferSource }),
    },
    cryptoKey,
    ciphertext as BufferSource
  )

  return new TextDecoder().decode(decrypted)
}

export async function decryptSubmission(
  ciphertext: string,
  iv: string,
  salt: string,
  ephemeralPublicKey: string,
  privateKey: Uint8Array,
  metadata?: { formId?: string; encryptionTimestamp?: number }
): Promise<string> {
  const ciphertextBuffer = base64ToBytes(ciphertext)
  const ivBuffer = base64ToBytes(iv)
  const saltBuffer = base64ToBytes(salt)
  const ephemeralPublicKeyBuffer = base64ToBytes(ephemeralPublicKey)

  const sharedSecret = deriveSharedSecret(privateKey, ephemeralPublicKeyBuffer)
  const aesKey = deriveAESKey(sharedSecret, saltBuffer)

  const aad = metadata
    ? new TextEncoder().encode(`${metadata.formId ?? ''}:${metadata.encryptionTimestamp ?? 0}`)
    : undefined

  return await decryptWithAES(ciphertextBuffer, aesKey, ivBuffer, aad)
}

export async function createHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(payload)

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyData as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    messageData as BufferSource
  )

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
