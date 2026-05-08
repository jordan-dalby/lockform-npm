import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { LockformNotFoundError } from '../dist/index.js'
import {
  cleanupTestEnv,
  closePool,
  createTempForm,
  createTestEnv,
  makeClient,
} from './helpers.mjs'

describe('webhooks (integration)', () => {
  let env, lf, formId

  before(async () => {
    env = await createTestEnv()
    lf = makeClient(env)
    const form = await createTempForm(lf, 'wh')
    formId = form.id
  })
  after(async () => {
    await cleanupTestEnv(env)
    await closePool()
  })

  test('lifecycle: get(404) → put → get → put(update) → test → delete → get(404)', async () => {
    await assert.rejects(() => lf.webhooks.get(formId), LockformNotFoundError)

    const created = await lf.webhooks.put(formId, {
      url: 'https://example.invalid/webhook',
      enabled: false,
      secret: 'whsec_integration',
    })
    assert.equal(created.webhook.url, 'https://example.invalid/webhook')

    const fetched = await lf.webhooks.get(formId)
    assert.equal(fetched.webhook.id, created.webhook.id)
    assert.equal(fetched.webhook.enabled, false)

    const updated = await lf.webhooks.put(formId, {
      url: 'https://example.invalid/webhook2',
      enabled: false,
    })
    assert.equal(updated.webhook.url, 'https://example.invalid/webhook2')

    // example.invalid is a reserved TLD that won't resolve, so the API will
    // record `delivered: false`. We only assert the response shape.
    const testResult = await lf.webhooks.test(formId)
    assert.equal(typeof testResult.delivered, 'boolean')
    assert.equal(typeof testResult.url, 'string')

    const deleted = await lf.webhooks.delete(formId)
    assert.equal(deleted, null)
    await assert.rejects(() => lf.webhooks.get(formId), LockformNotFoundError)
  })
})
