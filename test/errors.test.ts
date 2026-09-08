import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, errorFromStatus, extractServerMessage, isAbortError, normalizeError } from '@/services/errors'

const BASE = 'http://127.0.0.1:8081/v1'

test('errorFromStatus: maps HTTP codes to friendly kinds', () => {
  assert.equal(errorFromStatus(400, undefined, BASE).kind, 'bad_request')
  assert.equal(errorFromStatus(401, undefined, BASE).kind, 'unauthorized')
  assert.equal(errorFromStatus(403, undefined, BASE).kind, 'forbidden')
  assert.equal(errorFromStatus(404, undefined, BASE).kind, 'not_found')
  assert.equal(errorFromStatus(408, undefined, BASE).kind, 'timeout')
  assert.equal(errorFromStatus(429, undefined, BASE).kind, 'rate_limited')
  assert.equal(errorFromStatus(500, undefined, BASE).kind, 'server')
  assert.equal(errorFromStatus(503, undefined, BASE).kind, 'server')
  assert.equal(errorFromStatus(418, undefined, BASE).kind, 'unknown')
})

test('errorFromStatus: surfaces the server-provided message', () => {
  const e = errorFromStatus(400, { error: { message: 'model not allowed' } }, BASE)
  assert.ok(e.hint?.includes('model not allowed'))
})

test('errorFromStatus: proxy failures become proxy errors', () => {
  const e = errorFromStatus(502, { error: { message: 'ECONNREFUSED', type: 'glassgem_proxy_error' } }, BASE)
  assert.equal(e.kind, 'proxy')
  assert.ok(e.retryable)
})

test('extractServerMessage: supports common error shapes', () => {
  assert.equal(extractServerMessage('boom'), 'boom')
  assert.equal(extractServerMessage({ error: 'bad' }), 'bad')
  assert.equal(extractServerMessage({ error: { message: 'bad' } }), 'bad')
  assert.equal(extractServerMessage({ message: 'bad' }), 'bad')
  assert.equal(extractServerMessage({ detail: 'bad' }), 'bad')
  assert.equal(extractServerMessage(undefined), undefined)
})

test('normalizeError: passes ApiError through untouched', () => {
  const original = new ApiError('rate_limited', 'Rate limited', 'slow down')
  assert.equal(normalizeError(original, BASE), original)
})

test('normalizeError: abort errors are marked aborted', () => {
  const e = normalizeError(new DOMException('The operation was aborted.', 'AbortError'), BASE)
  assert.equal(e.kind, 'aborted')
  assert.ok(isAbortError(new DOMException('x', 'AbortError')))
  assert.ok(isAbortError(new ApiError('aborted', 'Stopped', 'cancelled')))
})

test('normalizeError: fetch failures become network errors with a hint', () => {
  const e = normalizeError(new TypeError('fetch failed'), BASE)
  assert.equal(e.kind, 'network')
  assert.ok(e.message.includes('127.0.0.1:8081'))
})

test('normalizeError: JSON parse failures are invalid_response', () => {
  const e = normalizeError(new SyntaxError('Unexpected token < in JSON'), BASE)
  assert.equal(e.kind, 'invalid_response')
})
