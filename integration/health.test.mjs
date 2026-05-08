import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  closePool,
  createTestEnv,
  cleanupTestEnv,
  makeAnonClient,
  makeClient,
} from './helpers.mjs'

describe('health (integration)', () => {
  let env
  before(async () => {
    env = await createTestEnv()
  })
  after(async () => {
    await cleanupTestEnv(env)
    await closePool()
  })

  test('GET /health succeeds with API key', async () => {
    const lf = makeClient(env)
    const out = await lf.health()
    assert.ok(out.status, 'status field present')
    assert.ok(typeof out.timestamp === 'string')
  })

  test('GET /health is reachable without auth', async () => {
    const lf = makeAnonClient()
    const out = await lf.health()
    assert.ok(out.status)
  })
})
