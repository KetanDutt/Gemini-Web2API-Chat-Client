export interface LauncherSpec {
  type: string
  command: string
  args: string[]
  cwd: string
}

export interface EnsureResult {
  running: boolean
  alreadyRunning?: boolean
  skipped?: boolean
  installOnly?: boolean
  launcher?: LauncherSpec
  pid?: number | null
  exitCode?: number
}

export interface EnsureOptions {
  port?: number
  background?: boolean
  timeoutSec?: number
  clone?: boolean
  download?: boolean
  forceMock?: boolean
  installOnly?: boolean
  stateDir?: string
}

export const DEFAULT_PORT: number

export function projectRoot(): string
export function web2apiBinaryName(platform?: string): string
export function parsePortFromUrl(raw: unknown): number | null
export function resolvePort(options?: { port?: number; env?: Record<string, string | undefined> }): number
export function resolvePidFile(stateDir?: string): string
export function resolveLogFile(stateDir?: string): string
export function isServerResponding(url: string, timeoutMs?: number): Promise<boolean>
export function hasGit(): boolean
export function hasGo(): boolean
export function findWeb2ApiDir(root?: string): string | null
export function ensureWeb2ApiCheckout(targetDir: string, options?: { clone?: boolean }): boolean
export function ensureWeb2ApiConfig(web2ApiDir: string | null, port?: number): string | null
export function releaseAssetName(platform?: string, arch?: string, tag?: string): string | null
export function ensurePrebuiltBinary(web2ApiDir: string | null): Promise<string | null>
export function tryGoBuild(web2ApiDir: string | null): string | null
export function resolveLauncher(web2ApiDir: string | null, port?: number): LauncherSpec
export function clearStalePid(stateDir?: string): void
export function reconcilePidFile(stateDir?: string): void
export function ensureWeb2Api(options?: EnsureOptions): Promise<EnsureResult>
