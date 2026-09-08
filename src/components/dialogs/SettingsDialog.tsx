import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, BookMarked, Check, Database, Eye, EyeOff, Info, Loader2, MessageSquare, Monitor, Moon, Plug, RefreshCw, Shield, Sliders, Sun, Trash2, Upload, Download, Wifi, WifiOff, ExternalLink } from 'lucide-react'
import { GlassDialog, ConfirmDialog } from '@/components/ui/Dialog'
import { Switch } from '@/components/ui/Switch'
import { Segmented } from '@/components/ui/Segmented'
import { FieldRow, Section } from '@/components/ui/Field'
import { useSettings } from '@/stores/settingsStore'
import { useConnection } from '@/stores/connectionStore'
import { useConversations } from '@/stores/conversationStore'
import { usePrompts } from '@/stores/promptStore'
import { useUI, type SettingsTab } from '@/stores/uiStore'
import { cn, downloadFile, formatBytes, formatDateTime, formatLatency, modelLabel, pluralize } from '@/lib/utils'
import { toast } from '@/hooks/useToast'
import { db, estimateStorage } from '@/services/db'
import { buildExport, parseImport } from '@/services/exportImport'
import { CAPABILITY_LABELS, type Capabilities } from '@/services/capabilities'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { PromptLibraryPanel } from './PromptLibraryDialog'

const APP_VERSION = __APP_VERSION__

const TABS: { id: SettingsTab; label: string; icon: typeof Sliders }[] = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'api', label: 'API', icon: Plug },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'prompts', label: 'Prompts', icon: BookMarked },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'about', label: 'About', icon: Info },
]

export function SettingsDialog() {
  const open = useUI((s) => s.dialog === 'settings')
  const closeDialog = useUI((s) => s.closeDialog)
  const tab = useUI((s) => s.settingsTab)
  const setTab = useUI((s) => s.setSettingsTab)
  const isMobile = useIsMobile()

  return (
    <GlassDialog open={open} onOpenChange={(o) => !o && closeDialog()} title="Settings" size="xl" className="h-[min(88dvh,760px)]">
      <div className={cn('flex min-h-0 flex-1', isMobile ? 'flex-col' : 'flex-row')}>
        <nav className={cn('shrink-0', isMobile ? 'flex gap-1 overflow-x-auto px-4 pb-2 no-scrollbar' : 'w-44 border-r border-line px-3 py-2')} aria-label="Settings sections">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-(--radius-sm) text-[13.5px] transition-colors duration-(--duration-fast)',
                  isMobile ? 'shrink-0 px-3 py-1.5' : 'mb-0.5 w-full px-3 py-2',
                  active ? 'font-medium text-fg' : 'text-fg-muted hover:bg-(--hover) hover:text-fg',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="settings-tab-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-(--radius-sm) bg-surface-3 shadow-[inset_0_0_0_1px_var(--glass-edge),var(--shadow-sm)]"
                    transition={{ type: 'spring', stiffness: 520, damping: 44, mass: 0.7 }}
                  />
                )}
                <t.icon size={15} className={cn('relative z-1 transition-colors duration-(--duration-fast)', active && 'text-accent')} />
                <span className="relative z-1">{t.label}</span>
              </button>
            )
          })}
        </nav>
        <div key={tab} className="enter-rise min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
          {tab === 'general' && <GeneralTab />}
          {tab === 'api' && <ApiTab />}
          {tab === 'chat' && <ChatTab />}
          {tab === 'prompts' && <PromptLibraryPanel embedded />}
          {tab === 'privacy' && <PrivacyTab />}
          {tab === 'data' && <DataTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </GlassDialog>
  )
}

/* ------------------------------------------------------------------ */

function GeneralTab() {
  const s = useSettings()
  return (
    <>
      <Section title="Appearance">
        <FieldRow label="Theme" description="Dark is the premium default; light is designed on its own terms.">
          <Segmented
            value={s.theme}
            onChange={(v) => s.set('theme', v)}
            options={[
              { value: 'system', label: 'System', icon: <Monitor size={13} /> },
              { value: 'light', label: 'Light', icon: <Sun size={13} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={13} /> },
            ]}
          />
        </FieldRow>
        <FieldRow label="Density" description="Spacing of messages and lists.">
          <Segmented
            value={s.density}
            onChange={(v) => s.set('density', v)}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'spacious', label: 'Spacious' },
            ]}
          />
        </FieldRow>
        <FieldRow label="Reduce motion" description="Disables ambient animation and transitions. Your OS preference is always respected." htmlFor="reduceMotion">
          <Switch id="reduceMotion" checked={s.reduceMotion} onCheckedChange={(v) => s.set('reduceMotion', v)} />
        </FieldRow>
      </Section>
      <Section title="Developer">
        <FieldRow label="Debug panel" description="Shows a bug icon in the top bar with request diagnostics. Never shows API keys." htmlFor="debugPanel">
          <Switch id="debugPanel" checked={s.debugPanel} onCheckedChange={(v) => s.set('debugPanel', v)} />
        </FieldRow>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ */

export function ApiForm({ onConnected, compact }: { onConnected?: () => void; compact?: boolean }) {
  const settings = useSettings()
  const connection = useConnection()
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [model, setModel] = useState(settings.defaultModel)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<null | { ok: boolean; latency?: number; via?: string }>(null)

  useEffect(() => {
    setBaseUrl(settings.baseUrl)
    setApiKey(settings.apiKey)
    setModel(settings.defaultModel)
  }, [settings.baseUrl, settings.apiKey, settings.defaultModel])

  const dirty = baseUrl !== settings.baseUrl || apiKey !== settings.apiKey || model !== settings.defaultModel
  const urlValid = /^https?:\/\/.+/i.test(baseUrl.trim())

  const save = () => {
    settings.update({ baseUrl: baseUrl.trim().replace(/\/+$/, ''), apiKey: apiKey.trim(), defaultModel: model.trim() || 'gemini-3.6-flash' })
    toast.success('Settings saved')
  }

  const test = async () => {
    if (!urlValid) return
    save()
    setTesting(true)
    setResult(null)
    // give the store a tick to update before testing
    await new Promise((r) => setTimeout(r, 30))
    const ok = await connection.test()
    const st = useConnection.getState()
    setResult({ ok, latency: st.lastLatencyMs })
    setTesting(false)
    if (ok) {
      toast.success('API connected', `${formatLatency(st.lastLatencyMs)} · ${st.models.length ? pluralize(st.models.length, 'model') : 'chat endpoint'}`)
      onConnected?.()
    } else {
      toast.error('API connection failed', st.lastError?.message)
    }
  }

  const err = useConnection((s) => s.lastError)
  const models = useConnection((s) => s.models)

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="baseUrl" className="mb-1 block text-[13px] font-medium">
          API Base URL
        </label>
        <input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="field font-mono text-[13.5px]" placeholder="http://127.0.0.1:8081/v1" aria-invalid={!urlValid} spellCheck={false} />
        <p className="mt-1 text-[12px] text-fg-subtle">Must end with <code className="font-mono">/v1</code>. The Web2API server should be running on this machine.</p>
      </div>
      <div>
        <label htmlFor="apiKey" className="mb-1 block text-[13px] font-medium">
          API Key
        </label>
        <div className="relative">
          <input id="apiKey" type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="field pr-10 font-mono text-[13.5px]" placeholder="sk-gemini" autoComplete="off" spellCheck={false} />
          <button type="button" className="icon-btn icon-btn-sm absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide API key' : 'Show API key'}>
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="defaultModel" className="mb-1 block text-[13px] font-medium">
          Default model
        </label>
        <input id="defaultModel" list="glassgem-models" value={model} onChange={(e) => setModel(e.target.value)} className="field font-mono text-[13.5px]" placeholder="gemini-3.6-flash" spellCheck={false} />
        {models.length > 0 && (
          <datalist id="glassgem-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </datalist>
        )}
        {models.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {models.slice(0, 8).map((m) => (
              <button key={m.id} type="button" onClick={() => setModel(m.id)} className={cn('pill h-7 cursor-pointer hover:bg-surface-2', m.id === model && 'border-accent/40 bg-accent-soft text-fg')}>
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button className="btn btn-primary" onClick={() => void test()} disabled={testing || !urlValid}>
          {testing ? <Loader2 size={15} className="animate-spin-slow" /> : <Plug size={15} />}
          Test Connection
        </button>
        {!compact && (
          <button className="btn btn-secondary" onClick={save} disabled={!dirty || !urlValid}>
            Save
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-[13px]">
          {testing || connection.state === 'checking' ? (
            <span className="flex items-center gap-1.5 text-fg-muted">
              <span className="status-dot checking" /> Connecting…
            </span>
          ) : result?.ok || (result == null && connection.state === 'connected') ? (
            <span className="flex items-center gap-1.5 text-success">
              <span className="status-dot connected" /> Connected{connection.lastLatencyMs ? ` · ${formatLatency(connection.lastLatencyMs)}` : ''}
            </span>
          ) : result && !result.ok ? (
            <span className="flex items-center gap-1.5 text-danger">
              <span className="status-dot offline" /> Connection failed
            </span>
          ) : null}
        </div>
      </div>

      {err && (connection.state === 'offline' || connection.state === 'error') && (
        <div className="enter-pop rounded-(--radius-lg) bg-(--danger-soft) p-3.5 text-[13px] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_25%,transparent)]" role="alert">
          <div className="flex gap-2.5">
            <WifiOff size={16} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="font-medium">{err.title}</p>
              <p className="mt-0.5 text-fg-muted">{err.message}</p>
              {err.hint && <p className="mt-1.5 whitespace-pre-wrap text-fg-muted">{err.hint}</p>}
              {err.status && <p className="mt-1.5 font-mono text-[11.5px] text-fg-subtle">HTTP {err.status} · {err.kind}</p>}
            </div>
          </div>
        </div>
      )}
      {connection.state === 'connected' && !compact && (
        <div className="enter-pop rounded-(--radius-lg) bg-(--success-soft) p-3.5 text-[13px] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--success)_25%,transparent)]">
          <div className="flex gap-2.5">
            <Wifi size={16} className="mt-0.5 shrink-0 text-success" />
            <div>
              <p className="font-medium">You're connected.</p>
              <p className="mt-0.5 text-fg-muted">
                {models.length ? `${pluralize(models.length, 'model')} discovered via /v1/models.` : 'Model listing is not available; the chat endpoint responded.'}
                {connection.lastSuccessAt ? ` Last success ${formatDateTime(connection.lastSuccessAt)}.` : ''}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ApiTab() {
  const s = useSettings()
  const caps = useConnection((c) => c.capabilities)
  const resetCaps = useConnection((c) => c.resetCapabilities)
  const refreshModels = useConnection((c) => c.refreshModels)
  const [refreshing, setRefreshing] = useState(false)
  return (
    <>
      <Section title="Gemini Web2API" description="GlassGem talks to the OpenAI-compatible server running on your machine.">
        <div className="py-4">
          <ApiForm />
        </div>
      </Section>
      <Section title="Connection">
        <FieldRow label="Use local proxy (recommended)" description="Routes requests through the GlassGem dev/preview server to avoid browser CORS restrictions. Only private / loopback addresses are allowed." htmlFor="useProxy">
          <Switch id="useProxy" checked={s.useProxy} onCheckedChange={(v) => s.set('useProxy', v)} />
        </FieldRow>
        <FieldRow label="Model list" description="Refresh models from GET /v1/models.">
          <button
            className="btn btn-secondary btn-sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true)
              refreshModels()
                .then(() => toast.success('Models refreshed'))
                .catch((e: Error) => toast.error('Could not load models', e.message))
                .finally(() => setRefreshing(false))
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin-slow' : ''} /> Refresh
          </button>
        </FieldRow>
      </Section>
      <Section title="Detected capabilities" description="GlassGem only enables features the server has actually demonstrated.">
        {(Object.keys(CAPABILITY_LABELS) as (keyof typeof CAPABILITY_LABELS)[]).map((k) => (
          <CapRow key={k} name={CAPABILITY_LABELS[k].label} desc={CAPABILITY_LABELS[k].description} state={caps[k]} />
        ))}
        <FieldRow label="Re-detect" description="Forget detected capabilities and probe again on the next request.">
          <button className="btn btn-secondary btn-sm" onClick={() => { resetCaps(); toast.info('Capabilities reset') }}>
            Reset
          </button>
        </FieldRow>
      </Section>
    </>
  )
}

function CapRow({ name, desc, state }: { name: string; desc: string; state: Capabilities[keyof Capabilities] }) {
  const s = state as 'unknown' | 'supported' | 'unsupported'
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-[13.5px] font-medium">{name}</p>
        <p className="text-[12px] text-fg-subtle">{desc}</p>
      </div>
      <span className={cn('pill h-6', s === 'supported' && 'pill-success', s === 'unsupported' && 'pill-danger')}>
        {s === 'supported' ? <Check size={11} /> : s === 'unsupported' ? <AlertTriangle size={11} /> : null}
        {s === 'supported' ? 'Supported' : s === 'unsupported' ? 'Unsupported' : 'Unknown'}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ChatTab() {
  const s = useSettings()
  const caps = useConnection((c) => c.capabilities)
  const setCap = useConnection((c) => c.setCapability)
  return (
    <>
      <Section title="Composer">
        <FieldRow label="Enter to send" description={s.enterToSend ? 'Shift+Enter inserts a new line.' : 'Use Ctrl+Enter to send.'} htmlFor="enterToSend">
          <Switch id="enterToSend" checked={s.enterToSend} onCheckedChange={(v) => s.set('enterToSend', v)} />
        </FieldRow>
        <FieldRow label="Stream responses" description="Show text as it arrives. Falls back to normal requests if the server doesn't support streaming." htmlFor="streaming">
          <Switch id="streaming" checked={s.streaming} onCheckedChange={(v) => s.set('streaming', v)} />
        </FieldRow>
      </Section>
      <Section title="Messages">
        <FieldRow label="Show timestamps" htmlFor="showTimestamps">
          <Switch id="showTimestamps" checked={s.showTimestamps} onCheckedChange={(v) => s.set('showTimestamps', v)} />
        </FieldRow>
        <FieldRow label="Show token usage" description="Displayed when the server reports usage." htmlFor="showUsage">
          <Switch id="showUsage" checked={s.showUsage} onCheckedChange={(v) => s.set('showUsage', v)} />
        </FieldRow>
        <FieldRow label="Show response time" htmlFor="showLatency">
          <Switch id="showLatency" checked={s.showLatency} onCheckedChange={(v) => s.set('showLatency', v)} />
        </FieldRow>
      </Section>
      <Section title="Titles">
        <FieldRow label="Auto-title conversations" description="Derive a title locally from your first message — no extra API request." htmlFor="autoTitle">
          <Switch id="autoTitle" checked={s.autoTitle} onCheckedChange={(v) => s.set('autoTitle', v)} />
        </FieldRow>
      </Section>
      <Section title="System instructions" description="Applied to new conversations. Existing conversations keep their own.">
        <FieldRow label="Send default system prompt" description={caps.systemMessages === 'unsupported' ? 'Your server rejected system messages; this is disabled.' : 'Adds a system message to new conversations.'} htmlFor="sendSystemPrompt">
          <Switch id="sendSystemPrompt" checked={s.sendSystemPrompt} onCheckedChange={(v) => s.set('sendSystemPrompt', v)} disabled={caps.systemMessages === 'unsupported'} />
        </FieldRow>
        <div className="py-3">
          <textarea value={s.defaultSystemPrompt} onChange={(e) => s.set('defaultSystemPrompt', e.target.value)} rows={3} placeholder="You are a helpful coding assistant…" className="field resize-y text-[13.5px]" />
        </div>
      </Section>
      <Section title="Sampling parameters" description="Only sent when enabled. If the server rejects them, GlassGem disables them automatically.">
        <FieldRow label="Send temperature / top_p / max_tokens" htmlFor="enableSamplingParams">
          <Switch id="enableSamplingParams" checked={s.enableSamplingParams} onCheckedChange={(v) => { s.set('enableSamplingParams', v); if (v && caps.samplingParams === 'unsupported') setCap('samplingParams', 'unknown') }} />
        </FieldRow>
        <div className={cn('grid grid-cols-3 gap-3 py-3', !s.enableSamplingParams && 'pointer-events-none opacity-40')}>
          <NumField label="Temperature" value={s.chatParams.temperature} min={0} max={2} step={0.1} onChange={(v) => s.set('chatParams', { ...s.chatParams, temperature: v })} />
          <NumField label="Top P" value={s.chatParams.top_p} min={0} max={1} step={0.05} onChange={(v) => s.set('chatParams', { ...s.chatParams, top_p: v })} />
          <NumField label="Max tokens" value={s.chatParams.max_tokens} min={1} max={65536} step={1} onChange={(v) => s.set('chatParams', { ...s.chatParams, max_tokens: v })} placeholder="auto" />
        </div>
      </Section>
      <Section title="Attachments">
        <FieldRow label="Enable image input" description="Only enable if your Web2API build accepts OpenAI-style image_url parts. GlassGem does not fake file support." htmlFor="enableImageInput">
          <Switch id="enableImageInput" checked={s.enableImageInput} onCheckedChange={(v) => { s.set('enableImageInput', v); setCap('imageInput', v ? 'supported' : 'unsupported') }} />
        </FieldRow>
      </Section>
    </>
  )
}

function NumField({ label, value, onChange, min, max, step, placeholder }: { label: string; value?: number; onChange: (v: number | undefined) => void; min: number; max: number; step: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-fg-muted">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="field h-9 px-3 py-0 text-[13px] tabular-nums"
      />
    </label>
  )
}

/* ------------------------------------------------------------------ */

function PrivacyTab() {
  const s = useSettings()
  const deleteAll = useConversations((c) => c.deleteAll)
  const convCount = useConversations((c) => c.conversations.length)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCreds, setConfirmCreds] = useState(false)
  const [msgCount, setMsgCount] = useState<number | null>(null)

  useEffect(() => {
    void estimateStorage().then(setStorage)
    void db.messages.count().then(setMsgCount)
  }, [convCount])

  return (
    <>
      <Section title="Local storage" description="Everything GlassGem stores lives in this browser profile on this computer.">
        <div className="space-y-2 py-3 text-[13.5px]">
          <InfoRow label="Conversations" value={`${convCount.toLocaleString()} (${msgCount?.toLocaleString() ?? '…'} messages)`} />
          <InfoRow label="Storage" value="IndexedDB (database “glassgem”) + localStorage for settings" />
          <InfoRow label="Used" value={storage ? `${formatBytes(storage.usage)} of ~${formatBytes(storage.quota)} available` : 'Unknown'} />
        </div>
      </Section>
      <Section title="Credentials">
        <div className="py-3 text-[13px] text-fg-muted">
          <p>
            The API key is stored in <code className="font-mono">localStorage</code> so it survives reloads. Anyone with access to this browser profile could read it. GlassGem never sends the key anywhere except your configured Web2API server, and never logs it.
          </p>
          <p className="mt-2">Gemini authentication cookies live only on the Web2API server — GlassGem never sees or stores them.</p>
        </div>
        <FieldRow label="Clear API credentials" description="Removes the stored API key. You'll be asked for it again.">
          <button className="btn btn-secondary btn-sm" onClick={() => setConfirmCreds(true)} disabled={!s.apiKey}>
            Clear key
          </button>
        </FieldRow>
      </Section>
      <Section title="Danger zone">
        <FieldRow label="Clear all conversations" description="Permanently deletes every conversation and message from this device.">
          <button className="btn btn-danger-soft btn-sm" onClick={() => setConfirmDelete(true)} disabled={convCount === 0}>
            <Trash2 size={13} /> Delete all
          </button>
        </FieldRow>
      </Section>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete all conversations?" description="This cannot be undone. Consider exporting your data first." confirmLabel="Delete everything" onConfirm={async () => { await deleteAll(); toast.success('All conversations deleted') }} />
      <ConfirmDialog open={confirmCreds} onOpenChange={setConfirmCreds} title="Clear API key?" description="Requests will fail until you enter a key again." confirmLabel="Clear key" onConfirm={() => { s.clearCredentials(); toast.success('API key cleared') }} />
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-fg-subtle">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function DataTab() {
  const importConversations = useConversations((c) => c.importConversations)
  const deleteAll = useConversations((c) => c.deleteAll)
  const prompts = usePrompts((p) => p.prompts)
  const importPrompts = usePrompts((p) => p.importPrompts)
  const clearPrompts = usePrompts((p) => p.clear)
  const settings = useSettings()
  const resetCaps = useConnection((c) => c.resetCapabilities)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<null | 'conversations' | 'settings' | 'reset'>(null)
  const [busy, setBusy] = useState(false)

  const exportAll = async () => {
    setBusy(true)
    try {
      const conversations = await db.conversations.toArray()
      const items = []
      for (const c of conversations) {
        const messages = await db.messages.where('[conversationId+order]').between([c.id, -Infinity], [c.id, Infinity]).toArray()
        items.push({ conversation: c, messages })
      }
      const data = buildExport(items, prompts)
      downloadFile(`glassgem-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
      toast.success('Export complete', `${pluralize(items.length, 'conversation')} · ${pluralize(prompts.length, 'prompt')}`)
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const parsed = parseImport(text)
      const n = await importConversations(parsed.conversations)
      const p = await importPrompts(parsed.prompts)
      toast.success('Import complete', `${pluralize(n, 'conversation')}${p ? ` · ${pluralize(p, 'prompt')}` : ''}`)
    } catch (e) {
      toast.error('Import failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <Section title="Backup" description="A single JSON file containing all conversations and saved prompts.">
        <FieldRow label="Export all data" description="Downloads glassgem-backup-YYYY-MM-DD.json">
          <button className="btn btn-secondary btn-sm" onClick={() => void exportAll()} disabled={busy}>
            <Download size={13} /> Export
          </button>
        </FieldRow>
        <FieldRow label="Import data" description="Accepts GlassGem JSON exports (single conversation or full backup). Malformed files are rejected safely.">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={13} /> Import
          </button>
        </FieldRow>
      </Section>
      <Section title="Remove">
        <FieldRow label="Delete all conversations" description="Messages and conversations only. Settings and prompts are kept.">
          <button className="btn btn-danger-soft btn-sm" onClick={() => setConfirm('conversations')}>
            Delete
          </button>
        </FieldRow>
        <FieldRow label="Clear settings" description="Restores default preferences and API configuration.">
          <button className="btn btn-secondary btn-sm" onClick={() => setConfirm('settings')}>
            Clear
          </button>
        </FieldRow>
        <FieldRow label="Reset application" description="Deletes everything: conversations, prompts, settings, and detected capabilities. Shows the first-run setup again.">
          <button className="btn btn-danger-soft btn-sm" onClick={() => setConfirm('reset')}>
            Reset
          </button>
        </FieldRow>
      </Section>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'conversations' ? 'Delete all conversations?' : confirm === 'settings' ? 'Clear all settings?' : 'Reset GlassGem?'}
        description={confirm === 'reset' ? 'All local data will be erased and the app will reload.' : 'This cannot be undone.'}
        confirmLabel={confirm === 'settings' ? 'Clear settings' : confirm === 'reset' ? 'Reset everything' : 'Delete all'}
        onConfirm={async () => {
          if (confirm === 'conversations') {
            await deleteAll()
            toast.success('Conversations deleted')
          } else if (confirm === 'settings') {
            settings.reset()
            settings.set('onboarded', true)
            resetCaps()
            toast.success('Settings cleared')
          } else if (confirm === 'reset') {
            await deleteAll()
            await clearPrompts()
            localStorage.clear()
            settings.reset()
            resetCaps()
            location.reload()
          }
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */

function AboutTab() {
  const connection = useConnection()
  const settings = useSettings()
  return (
    <>
      <Section title="GlassGem">
        <div className="space-y-2 py-3 text-[13.5px]">
          <InfoRow label="Version" value={APP_VERSION} />
          <InfoRow label="Tagline" value="Your personal Gemini workspace." />
          <InfoRow label="Storage" value="Local only (IndexedDB)" />
        </div>
      </Section>
      <Section title="Web2API connection">
        <div className="space-y-2 py-3 text-[13.5px]">
          <InfoRow label="Status" value={connection.state === 'connected' ? 'Connected' : connection.state === 'checking' ? 'Connecting…' : 'Offline'} />
          <InfoRow label="Endpoint" value={settings.baseUrl} />
          <InfoRow label="Default model" value={`${modelLabel(settings.defaultModel)} (${settings.defaultModel})`} />
          <InfoRow label="Latency" value={formatLatency(connection.lastLatencyMs)} />
        </div>
      </Section>
      <Section title="How it fits together">
        <div className="py-3 text-[13px] leading-relaxed text-fg-muted">
          <p><strong className="text-fg">GlassGem</strong> is a local frontend client. It never talks to Google directly.</p>
          <p className="mt-2"><strong className="text-fg">Gemini Web2API</strong> provides the OpenAI-compatible API on your machine and performs Gemini authentication on the server side.</p>
          <p className="mt-2">GlassGem does not handle, see, or store Google authentication cookies. This separation keeps your Google session isolated from the browser UI — which is important for security.</p>
        </div>
      </Section>
      <Section title="Open source licenses">
        <div className="py-3 text-[13px] text-fg-muted">
          <p>Built with React, Vite, TypeScript, Tailwind CSS, Radix UI, Zustand, Dexie, react-markdown, remark-gfm, highlight.js, Motion, Sonner, and Lucide icons — all under MIT or similarly permissive licenses.</p>
          <p className="mt-2">Typography uses your system's native font stack — no web fonts are downloaded.</p>
          <a href="https://github.com/KetanDutt/Gemini-Web2API-Chat-Client" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-accent hover:underline">
            Project repository <ExternalLink size={12} />
          </a>
        </div>
      </Section>
    </>
  )
}
