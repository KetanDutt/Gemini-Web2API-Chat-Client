import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Bug, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { copyToClipboard } from '@/lib/utils'
import { GemMark } from '@/components/layout/Logo'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
  copied: boolean
}

declare const __APP_VERSION__: string

/**
 * Last-resort crash screen. Any render error that escapes the component tree
 * lands here instead of white-screening the app, with one-click recovery and
 * a copyable diagnostics report. Conversations live in IndexedDB, so a reload
 * never loses chats.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info })
    console.error('[GlassGem] Unhandled render error:', error, info)
  }

  private diagnostics(): string {
    const { error, info } = this.state
    return [
      '# GlassGem crash report',
      `Time: ${new Date().toISOString()}`,
      `App version: ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'}`,
      `URL: ${window.location.href}`,
      `User agent: ${navigator.userAgent}`,
      '',
      `Error: ${error?.name ?? 'Error'}: ${error?.message ?? 'unknown'}`,
      '',
      'Stack:',
      error?.stack ?? '(none)',
      '',
      'Component stack:',
      info?.componentStack ?? '(none)',
    ].join('\n')
  }

  private onCopy = async () => {
    if (await copyToClipboard(this.diagnostics())) {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 1600)
    }
  }

  private onReload = () => {
    window.location.reload()
  }

  private onResetAndReload = async () => {
    // Nuclear option: drop all persisted site state (settings stay; chats are
    // in IndexedDB and kept) then reload. Only for crashes on boot.
    try {
      localStorage.removeItem('glassgem.activeConversation')
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full w-full items-center justify-center p-6" role="alert">
        <div className="glass-lg enter-pop w-full max-w-lg rounded-(--radius-2xl) p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-(--radius-lg) bg-surface-2 shadow-[inset_0_0_0_1px_var(--glass-edge)]">
            <GemMark size={26} />
          </div>
          <h1 className="text-[19px] font-semibold tracking-tight text-fg">Something went wrong</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">
            GlassGem hit an unexpected error in the interface. Your conversations are stored locally and are safe.
          </p>

          <div className="mt-5 flex items-start gap-2.5 rounded-(--radius-lg) bg-(--danger-soft) p-3.5 text-left shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_25%,transparent)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg">{error.name}</p>
              <p className="mt-0.5 break-words text-[12.5px] text-fg-muted [overflow-wrap:anywhere]">{error.message}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button className="btn btn-primary" onClick={this.onReload}>
              <RefreshCw size={15} /> Reload app
            </button>
            <button className="btn btn-secondary" onClick={() => void this.onCopy()}>
              {copied ? (
                <>
                  <Copy size={15} className="text-success" /> Copied!
                </>
              ) : (
                <>
                  <Bug size={15} /> Copy diagnostics
                </>
              )}
            </button>
            <button className="btn btn-ghost" onClick={() => void this.onResetAndReload()} title="Clears the remembered open conversation, then reloads">
              <Trash2 size={15} /> Reset &amp; reload
            </button>
          </div>

          <p className="mt-5 text-[11.5px] leading-relaxed text-fg-subtle">
            If this keeps happening, copy the diagnostics above and open an issue — it really helps.
          </p>
        </div>
      </div>
    )
  }
}
