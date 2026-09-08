/** Registers the alias loader before any test file is imported (see `npm test`). */
import { register } from 'node:module'

register(new URL('./loader.mjs', import.meta.url), import.meta.url)
