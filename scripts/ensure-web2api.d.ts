export interface LauncherSpec {
  type: string
  command: string
  args: string[]
  cwd: string
}

export interface EnsureResult {
  running: boolean
  alreadyRunning?: boolean
  child?: any
  launcher?: LauncherSpec
}

export function projectRoot(): string
export function isServerResponding(url: string, timeoutMs?: number): Promise<boolean>
export function findWeb2ApiDir(root?: string): string | null
export function ensureWeb2ApiCheckout(targetDir: string): boolean
export function resolveLauncher(web2ApiDir: string | null, port?: number): LauncherSpec
export function ensureWeb2Api(options?: { port?: number; background?: boolean; timeoutSec?: number }): Promise<EnsureResult>
