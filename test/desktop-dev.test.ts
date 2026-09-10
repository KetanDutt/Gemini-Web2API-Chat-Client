import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
// @ts-ignore - plain ESM helper module without type declarations
import { projectRoot, viteLaunchSpec } from '../scripts/desktop-dev.mjs'

test('viteLaunchSpec: launches Vite through node itself, never a shell shim', () => {
  const { command, args, viteBin } = viteLaunchSpec()
  // Since CVE-2024-27980 (Node 18.20.2 / 20.12.2 / 21.7.3+), spawning a
  // .cmd/.bat file on Windows with shell:false throws "spawn EINVAL" - the
  // launch spec must therefore never name npm.cmd or any batch wrapper.
  assert.equal(command, process.execPath)
  assert.doesNotMatch(command, /\.(cmd|bat)$/i)
  assert.doesNotMatch(path.basename(command), /^npm/i)
  assert.equal(args[0], viteBin)
  assert.match(viteBin, /node_modules[\\/]vite[\\/]bin[\\/]vite\.js$/)
})

test('viteLaunchSpec: keeps the desktop dev server on the fixed loopback port', () => {
  const { args } = viteLaunchSpec()
  const hostIndex = args.indexOf('--host')
  assert.ok(hostIndex >= 0)
  assert.equal(args[hostIndex + 1], '127.0.0.1')
  assert.ok(args.includes('--strictPort'))
})

test('viteLaunchSpec: Vite bin path resolves inside the project', () => {
  const { viteBin } = viteLaunchSpec()
  assert.ok(viteBin.startsWith(projectRoot() + path.sep))
  assert.ok(existsSync(viteBin), 'node_modules is installed when tests run')
})
