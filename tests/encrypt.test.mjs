import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encryptSubmission,
  validateEncryptedPayload,
  decryptWebhookData,
  derivePrivateKey,
  generateMnemonic15Words,
  validateMnemonic15Words,
  deriveKeyPairFromMnemonic,
  exportPublicKeyBase64,
  importPublicKeyBase64,
  encryptFileBlob,
} from '../dist/index.js'

test('encryptSubmission produces a wire-format-valid payload', async () => {
  const mnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)

  const envelope = await encryptSubmission({ a: 1 }, publicKeyBase64, { formId: 'f' })

  assert.ok(validateEncryptedPayload(envelope))
  assert.equal(envelope.algorithm, 'X25519+AES-256-GCM')
  assert.equal(typeof envelope.timestamp, 'number')
  assert.equal(typeof envelope.nonce, 'string')
})

test('encrypt -> decrypt round-trip via webhook payload shape', async () => {
  const mnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)

  const formId = 'form_round_trip'
  const data = { name: 'Jane', email: 'jane@example.com', count: 3 }

  const envelope = await encryptSubmission(data, publicKeyBase64, { formId })

  const webhookPayload = {
    event_type: 'submission.created',
    submission_id: 'sub_1',
    form_id: formId,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    salt: envelope.salt,
    ephemeral_public_key: envelope.ephemeralPublicKey,
    auth_tag: '',
    algorithm: envelope.algorithm,
    nonce: envelope.nonce,
    encryption_timestamp: envelope.timestamp,
    timestamp: '2026-01-01T00:00:00Z',
    field_mapping: { name: 'name', email: 'email', count: 'count' },
  }

  const decrypted = await decryptWebhookData({ payload: webhookPayload, passphrase: mnemonic })
  assert.deepEqual(decrypted.mappedData, data)
  assert.equal(decrypted.metadata.form_id, formId)
})

test('encrypt -> decrypt round-trip with base64 private key path', async () => {
  const mnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)
  const privateKeyBase64 = derivePrivateKey(mnemonic)

  const formId = 'form_b64'
  const envelope = await encryptSubmission({ x: 'y' }, publicKeyBase64, { formId })

  const decrypted = await decryptWebhookData({
    payload: {
      event_type: 'submission.created',
      submission_id: 's',
      form_id: formId,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      salt: envelope.salt,
      ephemeral_public_key: envelope.ephemeralPublicKey,
      auth_tag: '',
      algorithm: envelope.algorithm,
      nonce: envelope.nonce,
      encryption_timestamp: envelope.timestamp,
      timestamp: '2026-01-01T00:00:00Z',
      field_mapping: { x: 'x' },
    },
    passphrase: privateKeyBase64,
  })
  assert.equal(decrypted.mappedData.x, 'y')
})

test('decrypt with wrong passphrase fails', async () => {
  const mnemonic = generateMnemonic15Words()
  const otherMnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)

  const envelope = await encryptSubmission({ a: 1 }, publicKeyBase64, { formId: 'f' })

  await assert.rejects(() =>
    decryptWebhookData({
      payload: {
        event_type: 'e',
        submission_id: 's',
        form_id: 'f',
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
        ephemeral_public_key: envelope.ephemeralPublicKey,
        auth_tag: '',
        algorithm: envelope.algorithm,
        nonce: envelope.nonce,
        encryption_timestamp: envelope.timestamp,
        timestamp: 't',
        field_mapping: {},
      },
      passphrase: otherMnemonic,
    })
  )
})

test('decrypt with mismatched formId AAD fails', async () => {
  const mnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)

  const envelope = await encryptSubmission({ a: 1 }, publicKeyBase64, { formId: 'real' })

  await assert.rejects(() =>
    decryptWebhookData({
      payload: {
        event_type: 'e',
        submission_id: 's',
        form_id: 'tampered',
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
        ephemeral_public_key: envelope.ephemeralPublicKey,
        auth_tag: '',
        algorithm: envelope.algorithm,
        nonce: envelope.nonce,
        encryption_timestamp: envelope.timestamp,
        timestamp: 't',
        field_mapping: {},
      },
      passphrase: mnemonic,
    })
  )
})

test('derivePrivateKey is deterministic for a given mnemonic', () => {
  const mnemonic = generateMnemonic15Words()
  assert.equal(derivePrivateKey(mnemonic), derivePrivateKey(mnemonic))
})

test('validateMnemonic15Words rejects wrong word counts', () => {
  assert.equal(validateMnemonic15Words('only three words here'), false)
  assert.equal(validateMnemonic15Words(generateMnemonic15Words()), true)
})

test('importPublicKeyBase64 is the inverse of exportPublicKeyBase64', () => {
  const { publicKey } = deriveKeyPairFromMnemonic(generateMnemonic15Words())
  const round = importPublicKeyBase64(exportPublicKeyBase64(publicKey))
  assert.deepEqual(Array.from(round), Array.from(publicKey))
})

test('encryptFileBlob produces decryptable ciphertext', async () => {
  const plaintext = new TextEncoder().encode('hello world')
  const { ciphertext, keyBase64, ivBase64 } = await encryptFileBlob(plaintext)

  // Decrypt with the same key + iv via subtle.
  const { base64ToBytes } = await import('../dist/util/base64.js')
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    base64ToBytes(keyBase64),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
    key,
    ciphertext
  )
  assert.equal(new TextDecoder().decode(decrypted), 'hello world')
})

test('validateEncryptedPayload rejects malformed payloads', () => {
  assert.equal(validateEncryptedPayload(null), false)
  assert.equal(validateEncryptedPayload({}), false)
  assert.equal(
    validateEncryptedPayload({
      ciphertext: 'a',
      iv: 'b',
      salt: 'c',
      ephemeralPublicKey: 'd',
      algorithm: 'X25519+AES-256-GCM',
      nonce: 'e',
      timestamp: 'not-a-number',
    }),
    false
  )
})
