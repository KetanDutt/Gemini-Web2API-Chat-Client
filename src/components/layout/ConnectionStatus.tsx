import * as Popover from '@radix-ui/react-popover'
import { RefreshCw, Settings2, Wifi, WifiOff } from 'lucide-react'
import { useConnection } from '@/stores/connectionStore'
import { useSettings } from '@/stores/settingsStore'
import { useUI } from '@/stores/uiStore'
import { cn, formatDateTime, formatLatency, modelLabel } from '@/lib/utils'
import { useConversations } from '@/stores/conversationStore'

const LABELS = { connected: 'Gemini connected', offline: 'Web2API offline', error: 'Connection issue', checking: 'Connecting…', idle: 'Not connected' } as const

export function ConnectionStatus({ compact }: { compact?: boolean }) {
  const state = useConnection((s) => s.state)
  const lastSuccessAt = useConnection((s) => s.lastSuccessAt)
  const lastLatencyMs = useConnection((s) => s.lastLatencyMs)
  const lastError = useConnection((s) => s.lastError)
  const test = useConnection((s) => s.test)
  const baseUrl = useSettings((s) => s.baseUrl)
  const defaultModel = useSettings((s) => s.defaultModel)
  const activeModel = useConversations((s) => s.conversations.find((c) => c.id === s.activeId)?.model)
  const openDialog = useUI((s) => s.openDialog)

  const dotClass = state === 'connected' ? 'connected' : state === 'checking' ? 'checking' : state === 'idle' ? 'idle' : 'offline'

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={cn('pill h-8 cursor-pointer transition-colors hover:bg-surface-2', compact && 'px-2')}
          aria-label={`Connection status: ${LABELS[state]}`}
          title={LABELS[state]}
        >
          <span className={cn('status-dot', dotClass)} />
          {!compact && <span className="truncate">{LABELS[state]}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={8} className="glass glass-4 z-[95] w-[300px] rounded-[22px] p-4 text-[13px] animate-rise outline-none">
          <div className="mb-3 flex items-center gap-2">
            {state === 'connected' ? <Wifi size={16} className="text-success" /> : <WifiOff size={16} className={state === 'checking' ? 'text-warning' : 'text-danger'} />}
            <span className="font-semibold">{LABELS[state]}</span>
          </div>
          <dl className="space-y-2">
            <Row label="API URL" value={baseUrl} mono />
            <Row label="Model" value={modelLabel(activeModel ?? defaultModel)} sub={activeModel ?? defaultModel} />
            <Row label="Last success" value={lastSuccessAt ? formatDateTime(lastSuccessAt) : 'Never'} />
            <Row label="Latency" value={formatLatency(lastLatencyMs)} />
          </dl>
          {lastError && state !== 'connected' && (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-2.5 text-[12.5px]">
              <p className="font-medium text-danger">{lastError.title}</p>
              <p className="mt-0.5 text-fg-muted">{lastError.message}</p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button className="btn-glass h-8 flex-1 text-xs" onClick={() => void test()} disabled={state === 'checking'}>
              <RefreshCw size={13} className={state === 'checking' ? 'animate-spin' : ''} /> Test again
            </button>
            <Popover.Close asChild>
              <button className="btn-glass h-8 flex-1 text-xs" onClick={() => openDialog('settings', 'api')}>
                <Settings2 size={13} /> API settings
              </button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Row({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-fg-subtle">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right', mono && 'font-mono text-[12px]')} title={value}>
        {value}
        {sub && sub !== value && <span className="block truncate text-[11px] text-fg-subtle">{sub}</span>}
      </dd>
    </div>
  )
}
