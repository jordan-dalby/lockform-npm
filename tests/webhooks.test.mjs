import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lockform, LockformNotFoundError } from '../dist/index.js'
import { makeFetch, parseBody, pathOf } from './helpers.mjs'

test('webhooks.get - GET /v1/forms/:id/webhook', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { webhook: { id: 'w1', url: 'https://hook' } } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.webhooks.get('f1')
  assert.equal(calls[0].method, 'GET')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/webhook')
  assert.equal(out.webhook.id, 'w1')
})

test('webhooks.get - 404 when none configured', async () => {
  const { fetch } = makeFetch([
    { status: 404, body: { error: 'No webhook configured for this form' } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.webhooks.get('f1'), LockformNotFoundError)
})

test('webhooks.put - PUT /v1/forms/:id/webhook with body', async () => {
  const { fetch, calls } = makeFetch([
    { status: 201, body: { webhook: { id: 'w1', url: 'https://hook', enabled: true } } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.webhooks.put('f1', { url: 'https://hook', enabled: true, secret: 's' })
  assert.equal(calls[0].method, 'PUT')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/webhook')
  assert.deepEqual(parseBody(calls[0]), { url: 'https://hook', enabled: true, secret: 's' })
})

test('webhooks.delete - DELETE returns null', async () => {
  const { fetch, calls } = makeFetch([{ status: 204 }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.webhooks.delete('f1')
  assert.equal(calls[0].method, 'DELETE')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/webhook')
  assert.equal(out, null)
})

test('webhooks.test - POST /v1/forms/:id/webhook/test, returns delivery info', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { delivered: true, url: 'https://hook', status: 200 } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.webhooks.test('f1')
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/webhook/test')
  assert.equal(out.delivered, true)
  assert.equal(out.status, 200)
})

test('webhooks.test - surfaces non-2xx delivery as { delivered: false, error }', async () => {
  const { fetch } = makeFetch([
    { status: 200, body: { delivered: false, url: 'https://hook', status: null, error: 'timeout' } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.webhooks.test('f1')
  assert.equal(out.delivered, false)
  assert.equal(out.error, 'timeout')
})
