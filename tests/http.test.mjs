import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  Lockform,
  LockformAuthError,
  LockformNotFoundError,
  LockformValidationError,
  LockformRateLimitError,
  LockformServerError,
  LockformError,
  LockformNetworkError,
} from '../dist/index.js'
import { makeFetch, parseBody, extractQuery } from './helpers.mjs'

test('API key auth sends Bearer header', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { data: [], next_cursor: null } }])
  const lf = new Lockform({ apiKey: 'lf_secret', fetch })
  await lf.forms.list()
  assert.equal(calls[0].headers.Authorization, 'Bearer lf_secret')
})

test('JWT auth sends Bearer header and injects organization_id into query for GETs', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { form: { id: 'f1' } } }])
  const lf = new Lockform({ jwt: 'jwt_token', organizationId: 'org_1', fetch })
  await lf.forms.get('f1')
  assert.equal(calls[0].headers.Authorization, 'Bearer jwt_token')
  assert.equal(extractQuery(calls[0].url).organization_id, 'org_1')
})

test('JWT auth injects organization_id into JSON body for mutations', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { form: { id: 'f1' } } }])
  const lf = new Lockform({ jwt: 'jwt_token', organizationId: 'org_1', fetch })
  await lf.forms.update('f1', { title: 'New' })
  const body = parseBody(calls[0])
  assert.equal(body.organization_id, 'org_1')
  assert.equal(body.title, 'New')
})

test('JWT auth respects caller-provided organization_id', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { form: { id: 'f1' } } }])
  const lf = new Lockform({ jwt: 'jwt_token', organizationId: 'org_1', fetch })
  // The Form types don't accept organization_id, but the http layer is the
  // load-bearing component - bypass via a direct path that does:
  await lf.forms.update('f1', { title: 'X', organization_id: 'org_override' })
  const body = parseBody(calls[0])
  assert.equal(body.organization_id, 'org_override')
})

test('No auth → no Authorization header', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { status: 'healthy' } }])
  const lf = new Lockform({ fetch })
  await lf.health()
  assert.equal(calls[0].headers.Authorization, undefined)
})

test('Custom default headers are sent on requests', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { data: [], next_cursor: null } }])
  const lf = new Lockform({
    apiKey: 'lf_x',
    fetch,
    headers: { 'X-Trace-Id': 'abc' },
  })
  await lf.forms.list()
  assert.equal(calls[0].headers['X-Trace-Id'], 'abc')
})

test('204 responses resolve to null', async () => {
  const { fetch } = makeFetch([{ status: 204 }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const result = await lf.forms.delete('f1')
  assert.equal(result, null)
})

test('JSON body sets Content-Type', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { form: { id: 'f1' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.forms.create({ title: 'T' })
  assert.equal(calls[0].headers['Content-Type'], 'application/json')
})

test('Status-to-error mapping', async () => {
  const cases = [
    { status: 400, ctor: LockformValidationError, body: { error: 'bad' } },
    { status: 401, ctor: LockformAuthError, body: { error: 'unauth' } },
    { status: 403, ctor: LockformAuthError, body: { error: 'forbidden' } },
    { status: 404, ctor: LockformNotFoundError, body: { error: 'missing' } },
    { status: 429, ctor: LockformRateLimitError, body: { error: 'slow down' } },
    { status: 500, ctor: LockformServerError, body: { error: 'oops' } },
    { status: 418, ctor: LockformError, body: { error: 'teapot' } },
  ]
  for (const { status, ctor, body } of cases) {
    const { fetch } = makeFetch([{ status, body }])
    const lf = new Lockform({ apiKey: 'lf_x', fetch })
    let caught = null
    try {
      await lf.forms.list()
    } catch (e) {
      caught = e
    }
    assert.ok(caught instanceof ctor, `${status} should map to ${ctor.name}`)
    assert.equal(caught.status, status)
    assert.equal(caught.message, body.error)
    assert.deepEqual(caught.body, body)
  }
})

test('Error includes details when present in body', async () => {
  const { fetch } = makeFetch([
    { status: 500, body: { error: 'Failed', details: 'underlying message' } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  let caught = null
  try {
    await lf.forms.list()
  } catch (e) {
    caught = e
  }
  assert.equal(caught.details, 'underlying message')
})

test('Network failures throw LockformNetworkError', async () => {
  const fetch = async () => {
    throw new TypeError('failed to fetch')
  }
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.forms.list(), LockformNetworkError)
})

test('Query parameters with undefined values are skipped', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { data: [], next_cursor: null } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.forms.list({ limit: 25, cursor: undefined })
  const q = extractQuery(calls[0].url)
  assert.equal(q.limit, '25')
  assert.equal(q.cursor, undefined)
})
