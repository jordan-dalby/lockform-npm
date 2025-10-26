import { webcrypto } from 'node:crypto'

const crypto = webcrypto

export async function base64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
  const binaryString = Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export function arrayBufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer)
}

export async function importPrivateKey(pemKey: string): Promise<webcrypto.CryptoKey> {
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = pemKey
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '')

  const binaryDer = await base64ToArrayBuffer(pemContents)

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['unwrapKey']
  )
}

export async function decryptSubmission(
  ciphertext: string,
  iv: string,
  wrappedKey: string,
  authTag: string,
  privateKey: webcrypto.CryptoKey
): Promise<string> {
  const ciphertextBuffer = await base64ToArrayBuffer(ciphertext)
  const ivBuffer = await base64ToArrayBuffer(iv)
  const wrappedKeyBuffer = await base64ToArrayBuffer(wrappedKey)
  const authTagBuffer = await base64ToArrayBuffer(authTag)

  const combinedCiphertext = new Uint8Array(
    ciphertextBuffer.byteLength + authTagBuffer.byteLength
  )
  combinedCiphertext.set(new Uint8Array(ciphertextBuffer), 0)
  combinedCiphertext.set(new Uint8Array(authTagBuffer), ciphertextBuffer.byteLength)

  const unwrappedKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyBuffer,
    privateKey,
    {
      name: 'RSA-OAEP',
      hash: { name: 'SHA-256' },
    } as RsaOaepParams,
    {
      name: 'AES-GCM',
      length: 256,
    } as AesKeyAlgorithm,
    false,
    ['decrypt']
  )

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
    } as AesGcmParams,
    unwrappedKey,
    combinedCiphertext
  )

  return arrayBufferToString(decryptedBuffer)
}

export async function createHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(payload)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
