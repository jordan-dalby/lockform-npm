/**
 * Shared test helpers. Tests run against the built `dist/` so they exercise
 * the same JS that ships to consumers.
 */

/**
 * Build a fake fetch that walks through `responses` in order. Each entry is
 * either:
 *   - a function `(url, init) => Response | { status, body, headers }` for
 *     dynamic responses, or
 *   - a plain `{ status, body, headers }` object.
 *
 * The fake records every call into `calls` so tests can assert URL, method,
 * headers, and body.
 */
export function makeFetch(responses) {
  const calls = []
  let i = 0
  const fetch = async (url, init = {}) => {
    const headers = init.headers ?? {}
    calls.push({
      url: typeof url === 'string' ? url : url.toString(),
      method: init.method ?? 'GET',
      headers: { ...headers },
      body: init.body,
    })
    if (i >= responses.length) {
      throw new Error(
        `Unexpected fetch #${i + 1}: ${init.method ?? 'GET'} ${url}. ` +
          `Only ${responses.length} responses queued.`
      )
    }
    const entry = responses[i++]
    const resolved = typeof entry === 'function' ? await entry(String(url), init) : entry
    if (resolved instanceof Response) return resolved
    return jsonResponse(resolved.status ?? 200, resolved.body, resolved.headers)
  }
  return { fetch, calls }
}

export function jsonResponse(status, body, extraHeaders) {
  if (status === 204) {
    return new Response(null, { status })
  }
  const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(payload, {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  })
}

export function parseBody(call) {
  if (!call.body) return null
  if (typeof call.body === 'string') {
    try {
      return JSON.parse(call.body)
    } catch {
      return call.body
    }
  }
  return call.body
}

export function extractQuery(url) {
  return Object.fromEntries(new URL(url).searchParams.entries())
}

export function pathOf(url) {
  return new URL(url).pathname
}
