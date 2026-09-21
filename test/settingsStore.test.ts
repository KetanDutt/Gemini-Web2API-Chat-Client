import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_REQUEST_TIMEOUT_SEC,
  MAX_REQUEST_TIMEOUT_SEC,
  MIN_REQUEST_TIMEOUT_SEC,
  requestTimeoutMs,
  selectApiConfig,
} from '@/stores/settingsStore'

test('requestTimeoutMs: defaults when the value is missing or invalid', () => {
  assert.equal(requestTimeoutMs(undefined), DEFAULT_REQUEST_TIMEOUT_SEC * 1000)
  assert.equal(requestTimeoutMs(Number.NaN), DEFAULT_REQUEST_TIMEOUT_SEC * 1000)
  assert.equal(requestTimeoutMs('nope' as unknown as number), DEFAULT_REQUEST_TIMEOUT_SEC * 1000)
})

test('requestTimeoutMs: clamps into the allowed range', () => {
  assert.equal(requestTimeoutMs(0), MIN_REQUEST_TIMEOUT_SEC * 1000)
  assert.equal(requestTimeoutMs(1), MIN_REQUEST_TIMEOUT_SEC * 1000)
  assert.equal(requestTimeoutMs(120), 120000)
  assert.equal(requestTimeoutMs(99999), MAX_REQUEST_TIMEOUT_SEC * 1000)
})

test('selectApiConfig: maps settings onto the API client config', () => {
  const config = selectApiConfig({
    baseUrl: 'http://127.0.0.1:9000/v1',
    apiKey: 'sk-test',
    useProxy: false,
    requestTimeoutSec: 300,
  })
  assert.deepEqual(config, {
    baseUrl: 'http://127.0.0.1:9000/v1',
    apiKey: 'sk-test',
    useProxy: false,
    timeoutMs: 300000,
  })
})
