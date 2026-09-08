import { GlassDialog } from '@/components/ui/Dialog'
import { useUI } from '@/stores/uiStore'
import { useConnection } from '@/stores/connectionStore'
import { useSettings } from '@/stores/settingsStore'
import { useConversations } from '@/stores/conversationStore'
import { cn, formatLatency, formatTime } from '@/lib/utils'
import { resolveEndpoint } from '@/services/geminiWebApi'

export function DebugDialog() {
  const open = useUI((s) => s.dialog === 'debug')
  const closeDialog = useUI((s) => s.closeDialog)
  const conn = useConnection()
  const settings = useSettings()
  const activeModel = useConversations((s) => s.conversations.find((c) => c.id === s.activeId)?.model)
  const generating = useConversations((s) => Object.keys(s.generating).length > 0)
  const last = conn.traces[0]
  const { url } = resolveEndpoint({ baseUrl: settings.baseUrl, apiKey: '', useProxy: settings.useProxy }, '/chat/completions')

  return (
    <GlassDialog open={open} onOpenChange={(o) => !o && closeDialog()} title="Debug panel" description="Request diagnostics for the Web2API connection. API keys and cookies are never shown." size="lg" className="h-[min(85dvh,700px)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid gap-2 text-[13px] sm:grid-cols-2">
          <Cell label="API endpoint" value={settings.baseUrl} mono />
          <Cell label="Browser fetch URL" value={url} mono />
          <Cell label="Proxy" value={settings.useProxy ? 'On (local dev proxy)' : 'Off (direct)'} />
          <Cell label="Model" value={activeModel ?? settings.defaultModel} mono />
          <Cell label="Connection" value={conn.state} />
          <Cell label="Streaming state" value={conn.isStreamingNow ? 'Streaming now' : generating ? 'Generating (non-stream)' : 'Idle'} />
          <Cell label="Last HTTP status" value={last?.status != null ? String(last.status) : '—'} />
          <Cell label="Last duration" value={formatLatency(last?.durationMs)} />
          <Cell label="Last token usage" value={last?.usage ? `${last.usage.prompt_tokens ?? '?'} + ${last.usage.completion_tokens ?? '?'} = ${last.usage.total_tokens ?? '?'}` : '—'} />
          <Cell label="Last error" value={conn.lastError ? `${conn.lastError.title}: ${conn.lastError.message}` : '—'} />
        </div>

        <h3 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Recent requests</h3>
        {conn.traces.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No requests yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Request</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {conn.traces.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-3 py-1.5 tabular-nums text-fg-muted">{formatTime(t.at)}</td>
                    <td className="px-3 py-1.5 font-mono">
                      {t.method} {t.endpoint}
                      {t.streamed ? ' (stream)' : ''}
                      {t.error && <span className="block truncate text-[11px] text-danger" title={t.error}>{t.error}</span>}
                    </td>
                    <td className={cn('px-3 py-1.5 tabular-nums', t.ok ? 'text-success' : 'text-danger')}>{t.status ?? (t.ok ? 'OK' : 'ERR')}</td>
                    <td className="px-3 py-1.5 tabular-nums">{formatLatency(t.durationMs)}</td>
                    <td className="px-3 py-1.5 tabular-nums">{t.usage?.total_tokens ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </GlassDialog>
  )
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className={cn('mt-0.5 truncate', mono && 'font-mono text-[12px]')} title={value}>
        {value}
      </p>
    </div>
  )
}
