import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, RefreshCw, Sparkles } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { useConnection } from '@/stores/connectionStore'
import { useSettings } from '@/stores/settingsStore'
import { cn, modelLabel } from '@/lib/utils'
import type { ModelInfo } from '@/types'

export function ModelSelector({ value, onChange, compact, align = 'start', side = 'top' }: { value: string; onChange: (id: string) => void; compact?: boolean; align?: 'start' | 'end' | 'center'; side?: 'top' | 'bottom' }) {
  const models = useConnection((s) => s.models)
  const modelsError = useConnection((s) => s.modelsError)
  const refreshModels = useConnection((s) => s.refreshModels)
  const listingCap = useConnection((s) => s.capabilities.modelListing)
  const customModels = useSettings((s) => s.customModels)
  const defaultModel = useSettings((s) => s.defaultModel)
  const setSetting = useSettings((s) => s.set)
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const all = useMemo<ModelInfo[]>(() => {
    const map = new Map<string, ModelInfo>()
    for (const m of models) map.set(m.id, m)
    for (const id of [defaultModel, ...customModels, value]) {
      if (id && !map.has(id)) map.set(id, { id, label: modelLabel(id) })
    }
    return [...map.values()]
  }, [models, customModels, defaultModel, value])

  useEffect(() => {
    if (open && models.length === 0 && listingCap !== 'unsupported') {
      setRefreshing(true)
      refreshModels()
        .catch(() => undefined)
        .finally(() => setRefreshing(false))
    }
  }, [open, models.length, listingCap, refreshModels])

  const addCustom = () => {
    const id = custom.trim()
    if (!id) return
    if (!customModels.includes(id)) setSetting('customModels', [...customModels, id])
    onChange(id)
    setCustom('')
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn('btn btn-ghost btn-sm h-8 max-w-[220px] gap-1.5 px-2.5 text-[13px] text-fg data-[state=open]:bg-(--hover)', compact && 'max-w-[150px]')}
          aria-label={`Model: ${modelLabel(value)}`}
        >
          <Sparkles size={14} className="shrink-0 text-accent" />
          <span className="truncate">{modelLabel(value)}</span>
          <ChevronDown size={13} className="icon-rotate shrink-0 text-fg-subtle" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align={align} side={side} sideOffset={8} collisionPadding={8} className="glass-float motion-pop z-(--z-popover) w-[300px] origin-(--radix-popover-content-transform-origin) rounded-(--radius-lg) p-2 outline-none">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="eyebrow">Models</span>
            {listingCap !== 'unsupported' && (
              <button
                className="icon-btn icon-btn-xs"
                aria-label="Refresh model list"
                disabled={refreshing}
                onClick={() => {
                  setRefreshing(true)
                  refreshModels()
                    .catch(() => undefined)
                    .finally(() => setRefreshing(false))
                }}
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin-slow' : ''} />
              </button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {all.map((m) => {
              const active = m.id === value
              return (
                <button
                  key={m.id}
                  className={cn('menu-item text-left', active && 'is-active')}
                  onClick={() => {
                    onChange(m.id)
                    setOpen(false)
                  }}
                >
                  <span className="flex w-4 items-center justify-center">{active ? <Check size={14} className="text-accent" /> : <Sparkles size={13} className="text-fg-subtle" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.label}</span>
                    <span className="block truncate font-mono text-[11px] text-fg-subtle">{m.id}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {models.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-fg-subtle">
              {refreshing ? 'Loading models from the server…' : listingCap === 'unsupported' ? 'This server does not list models. Enter a model ID manually.' : modelsError ? `Could not load models: ${modelsError}` : 'No models discovered yet.'}
            </p>
          )}
          <div className="menu-sep" />
          <form
            className="flex items-center gap-1.5 p-1"
            onSubmit={(e) => {
              e.preventDefault()
              addCustom()
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom model ID…" className="field field-sm h-8 flex-1 py-0 font-mono text-[12px]" aria-label="Custom model ID" />
            <button type="submit" className="icon-btn icon-btn-sm" aria-label="Use custom model" disabled={!custom.trim()}>
              <Plus size={15} />
            </button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
