/**
 * End-to-end flow that exercises every endpoint in the public/submissions/files
 * groups against a single form. Order matters - earlier subtests provision the
 * state later ones consume.
 */

import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  LockformAuthError,
  LockformNotFoundError,
  decryptWebhookData,
  deriveKeyPairFromMnemonic,
  encryptSubmission,
  exportPublicKeyBase64,
} from '../dist/index.js'
import {
  cleanupTestEnv,
  closePool,
  createTempForm,
  createTestEnv,
  makeAnonClient,
  makeClient,
  submissionToWebhookPayload,
} from './helpers.mjs'

describe('e2e: public + submissions + files (integration)', () => {
  let env, lf, pub, formId, accessToken
  let submissionId           // created by submitWithFiles, has a file
  let throwawaySubmissionId  // created by manual submit, used for delete()
  let submittedFilePlaintext

  before(async () => {
    env = await createTestEnv()
    lf = makeClient(env)
    pub = makeAnonClient()
    const form = await createTempForm(lf, 'e2e')
    formId = form.id
    const tok = await lf.accessTokens.create(formId, { label: 'e2e' })
    accessToken = tok.access_token.token
    if (!accessToken) {
      throw new Error('access token plaintext missing - cannot run e2e')
    }
  })
  after(async () => {
    await cleanupTestEnv(env)
    await closePool()
  })

  // ---- public.* ------------------------------------------------------------

  test('public.getForm returns the active public_key matching the seeded mnemonic', async () => {
    const out = await pub.public.getForm(formId, accessToken)
    assert.equal(out.form.id, formId)
    assert.equal(out.algorithm, 'X25519+AES-256-GCM')
    const { publicKey } = deriveKeyPairFromMnemonic(env.mnemonic)
    assert.equal(
      out.public_key,
      exportPublicKeyBase64(publicKey),
      'public_key returned by API must match the key seeded into the keys table'
    )
  })

  test('public.prepareUpload returns a signed PUT URL and upload_token', async () => {
    const out = await pub.public.prepareUpload(formId, accessToken, {
      expected_size: 1024,
    })
    assert.ok(out.signed_url.startsWith('http'))
    assert.ok(out.upload_token.length > 0)
    assert.ok(out.storage_path.length > 0)
    assert.ok(typeof out.expires_in_seconds === 'number')
  })

  test('public.submit with manually-encrypted envelope', async () => {
    const formInfo = await pub.public.getForm(formId, accessToken)
    const envelope = await encryptSubmission(
      { manual: true, when: new Date().toISOString() },
      formInfo.public_key,
      { formId }
    )
    const out = await pub.public.submit(formId, accessToken, {
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      salt: envelope.salt,
      ephemeral_public_key: envelope.ephemeralPublicKey,
      algorithm: envelope.algorithm,
      nonce: envelope.nonce,
      timestamp: envelope.timestamp,
    })
    assert.ok(out.submission_id)
    throwawaySubmissionId = out.submission_id
  })

  test('public.submit with bad token → LockformAuthError', async () => {
    // Envelope validation (timestamp skew, base64 byte-lengths) runs before
    // the access-token check, so we need a *real* envelope encrypted against
    // the form's public key - only then will the API reach the auth path and
    // return 403 instead of 400 "Invalid request" / "Request expired".
    const formInfo = await pub.public.getForm(formId, accessToken)
    const envelope = await encryptSubmission(
      { probe: 'auth-error' },
      formInfo.public_key,
      { formId }
    )
    await assert.rejects(
      () =>
        pub.public.submit(formId, 'lf_at_bogus_token', {
          ciphertext: envelope.ciphertext,
          iv: envelope.iv,
          salt: envelope.salt,
          ephemeral_public_key: envelope.ephemeralPublicKey,
          algorithm: envelope.algorithm,
          nonce: envelope.nonce,
          timestamp: envelope.timestamp,
        }),
      LockformAuthError
    )
  })

  test('public.submitWithFiles full e2e (encrypt → upload → submit → fetch → decrypt)', async () => {
    submittedFilePlaintext = new TextEncoder().encode('hello integration test')
    const result = await pub.public.submitWithFiles(formId, accessToken, {
      data: { name: 'Jane', email: 'jane@example.com' },
      files: [
        {
          field: 'cv',
          file: submittedFilePlaintext,
          filename: 'cv.txt',
          contentType: 'text/plain',
        },
      ],
    })
    assert.ok(result.submission_id)
    submissionId = result.submission_id

    const fetched = await lf.submissions.get(submissionId)
    const decrypted = await decryptWebhookData({
      payload: submissionToWebhookPayload(fetched.submission, ['name', 'email', 'cv']),
      passphrase: env.mnemonic,
    })
    assert.equal(decrypted.mappedData.name, 'Jane')
    assert.equal(decrypted.mappedData.email, 'jane@example.com')
    assert.equal(
      decrypted.rawData.__lockform_files,
      undefined,
      'no legacy __lockform_files key - files inline as FileSubmissionValue'
    )
    const cv = decrypted.rawData.cv
    assert.equal(cv.filename, 'cv.txt')
    assert.equal(cv.mime_type, 'text/plain')
    assert.equal(cv.size, submittedFilePlaintext.byteLength)
    assert.ok(cv.storage_path)
    assert.ok(cv.file_key)
    assert.ok(cv.file_iv)
  })

  // ---- submissions admin endpoints ----------------------------------------

  test('submissions.list (form-scoped) includes both submissions', async () => {
    const list = await lf.submissions.list(formId, { limit: 50 })
    assert.ok(list.data.length >= 2, 'expected at least 2 submissions')
    const ids = list.data.map((s) => s.id)
    assert.ok(ids.includes(submissionId))
    assert.ok(ids.includes(throwawaySubmissionId))
  })

  test('submissions.count returns a positive count', async () => {
    const out = await lf.submissions.count(formId)
    assert.ok(out.count >= 2)
  })

  test('submissions.iterate yields all submissions', async () => {
    let count = 0
    for await (const _ of lf.submissions.iterate(formId, { limit: 50 })) count++
    assert.ok(count >= 2)
  })

  test('submissions.list with future from-date returns empty', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
    const future = await lf.submissions.list(formId, { from: tomorrow, limit: 5 })
    assert.equal(future.data.length, 0)
  })

  test('submissions.get returns the e2e submission envelope', async () => {
    const out = await lf.submissions.get(submissionId)
    assert.equal(out.submission.id, submissionId)
    assert.ok(out.submission.ciphertext)
  })

  // ---- files.prepareDownload - must run BEFORE update wipes file metadata --

  test('files.prepareDownload yields a signed GET URL; ciphertext decrypts to plaintext', async () => {
    const fetched = await lf.submissions.get(submissionId)
    const decrypted = await decryptWebhookData({
      payload: submissionToWebhookPayload(fetched.submission, ['cv']),
      passphrase: env.mnemonic,
    })
    const cv = decrypted.rawData.cv
    assert.ok(cv?.storage_path, 'expected file metadata in decrypted plaintext')

    const prep = await lf.files.prepareDownload(submissionId, cv.storage_path)
    assert.ok(prep.signed_url.startsWith('http'))

    // Round-trip through storage: GET ciphertext, decrypt with the per-file
    // key+iv, assert plaintext matches what we uploaded.
    const ctRes = await fetch(prep.signed_url)
    assert.equal(ctRes.status, 200, `signed URL must return 200, got ${ctRes.status}`)
    const ciphertext = new Uint8Array(await ctRes.arrayBuffer())

    const keyBytes = Uint8Array.from(atob(cv.file_key), (c) => c.charCodeAt(0))
    const ivBytes = Uint8Array.from(atob(cv.file_iv), (c) => c.charCodeAt(0))
    const aesKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )
    const plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      aesKey,
      ciphertext
    )
    const plaintext = new Uint8Array(plaintextBuf)
    assert.deepEqual(
      Array.from(plaintext),
      Array.from(submittedFilePlaintext),
      'decrypted file bytes must match what we uploaded'
    )
  })

  test('submissions.update (PATCH) replaces the envelope', async () => {
    const formInfo = await pub.public.getForm(formId, accessToken)
    const envelope = await encryptSubmission(
      { updated: true, at: Date.now() },
      formInfo.public_key,
      { formId }
    )
    const out = await lf.submissions.update(submissionId, {
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      salt: envelope.salt,
      ephemeral_public_key: envelope.ephemeralPublicKey,
      algorithm: envelope.algorithm,
      nonce: envelope.nonce,
      timestamp: envelope.timestamp,
    })
    assert.equal(out.submission.id, submissionId)
  })

  test('submissions.delete (single) on the throwaway returns null', async () => {
    const result = await lf.submissions.delete(throwawaySubmissionId)
    assert.equal(result, null)
    await assert.rejects(
      () => lf.submissions.get(throwawaySubmissionId),
      LockformNotFoundError
    )
  })

  test('submissions.deleteAll wipes the rest', async () => {
    const out = await lf.submissions.deleteAll(formId)
    assert.ok(typeof out.deleted === 'number')
    const count = await lf.submissions.count(formId)
    assert.equal(count.count, 0)
  })

  test('error: submissions.get on unknown id → LockformNotFoundError', async () => {
    await assert.rejects(
      () => lf.submissions.get('00000000-0000-0000-0000-000000000000'),
      LockformNotFoundError
    )
  })
})
