import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lockform } from '../dist/index.js'
import { makeFetch } from './helpers.mjs'

test('Lockform throws when both apiKey and jwt are provided', () => {
  assert.throws(() => new Lockform({ apiKey: 'lf_x', jwt: 'jwt' }), /either `apiKey` or `jwt`/)
})

test('Lockform throws when jwt is provided without organizationId', () => {
  assert.throws(() => new Lockform({ jwt: 'jwt' }), /organizationId.*required/)
})

test('Lockform constructs without auth (public/anonymous mode)', () => {
  const lf = new Lockform({ fetch: () => new Response('{}', { status: 200 }) })
  assert.ok(lf.public)
  assert.ok(lf.forms)
})

test('Lockform.health calls /health without Authorization', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { status: 'healthy', timestamp: 't', service: 'lockform-api' } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const result = await lf.health()
  assert.equal(result.status, 'healthy')
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.match(calls[0].url, /\/health$/)
})

test('Lockform uses configured baseUrl', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { status: 'healthy' } }])
  const lf = new Lockform({ apiKey: 'lf_x', baseUrl: 'https://api.staging.example', fetch })
  await lf.health()
  assert.match(calls[0].url, /^https:\/\/api\.staging\.example\/health$/)
})

test('Lockform throws if no fetch is available', () => {
  // Force an explicit `fetch: undefined` to override globalThis.
  const original = globalThis.fetch
  // @ts-ignore
  delete globalThis.fetch
  try {
    assert.throws(() => new Lockform({ apiKey: 'lf_x' }), /fetch implementation/)
  } finally {
    globalThis.fetch = original
  }
})
