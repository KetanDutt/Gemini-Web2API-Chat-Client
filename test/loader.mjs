/**
 * Module-resolution hook for running the test suite with Node's built-in
 * test runner (`npm test`). It teaches Node about:
 *   - the `@/` alias that maps to `src/` (mirrors tsconfig paths + Vite alias)
 *   - extensionless relative imports between TypeScript files
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const TS_EXTENSIONS = ['', '.ts', '.tsx', '/index.ts']

function tryFile(base) {
  for (const ext of TS_EXTENSIONS) {
    const candidate = base + ext
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const file = tryFile(path.join(SRC, specifier.slice(2)))
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    throw new Error(`Test loader could not resolve alias import: ${specifier}`)
  }

  // Extensionless relative imports inside src/ (e.g. `./errors` from a .ts file).
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.endsWith('.ts')) {
    try {
      return await nextResolve(specifier, context)
    } catch {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const file = tryFile(path.resolve(parentDir, specifier))
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
      throw new Error(`Test loader could not resolve relative import: ${specifier} from ${context.parentURL}`)
    }
  }

  return nextResolve(specifier, context)
}
