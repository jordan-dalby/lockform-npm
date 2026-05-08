import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanupTestEnv,
  closePool,
  createTestEnv,
  makeClient,
  TINY_PNG,
} from './helpers.mjs'

describe('form images (integration)', () => {
  let env, lf

  before(async () => {
    env = await createTestEnv()
    lf = makeClient(env)
  })
  after(async () => {
    await cleanupTestEnv(env)
    await closePool()
  })

  test('upload returns url + path; second upload of same content is reused', async () => {
    const first = await lf.forms.images.upload({
      file: TINY_PNG,
      contentType: 'image/png',
      filename: 'tiny.png',
    })
    assert.ok(typeof first.url === 'string' && first.url.length > 0)
    assert.ok(typeof first.path === 'string' && first.path.length > 0)

    const second = await lf.forms.images.upload({
      file: TINY_PNG,
      contentType: 'image/png',
      filename: 'tiny.png',
    })
    assert.equal(second.path, first.path, 'SHA-256 dedup should return same path')
    assert.equal(second.reused, true)

    const result = await lf.forms.images.delete(first.path)
    assert.equal(result, null)
  })

  test('delete on bogus path rejects (org-prefix check or 404)', async () => {
    await assert.rejects(() =>
      lf.forms.images.delete('definitely/not/a/real/path.png')
    )
  })
})
