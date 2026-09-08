import { useState } from 'react'
import { ArrowRight, Check, Shield } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { GemMark } from '@/components/layout/Logo'
import { useSettings } from '@/stores/settingsStore'
import { useConnection } from '@/stores/connectionStore'
import { ApiForm } from './SettingsDialog'

export function OnboardingDialog() {
  const onboarded = useSettings((s) => s.onboarded)
  const set = useSettings((s) => s.set)
  const connected = useConnection((s) => s.state === 'connected')
  const [tested, setTested] = useState(false)

  const finish = () => set('onboarded', true)

  return (
    <DialogPrimitive.Root open={!onboarded}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-[8px] animate-fade-in dark:bg-black/55" />
        <DialogPrimitive.Content
          className="glass glass-4 fixed left-1/2 top-1/2 z-[90] flex max-h-[90dvh] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[30px] outline-none animate-rise"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="overflow-y-auto px-7 pb-6 pt-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-2 shadow-[0_12px_30px_-12px_var(--accent-glow)]">
                <GemMark size={28} />
              </span>
              <div>
                <DialogPrimitive.Title className="text-[20px] font-semibold tracking-tight">Connect to Gemini Web2API</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-fg-muted">GlassGem runs entirely on this computer and talks to your local server.</DialogPrimitive.Description>
              </div>
            </div>

            <ApiForm compact onConnected={() => setTested(true)} />

            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3 text-[12.5px] text-fg-muted">
              <Shield size={15} className="mt-0.5 shrink-0 text-accent" />
              <p>Your API key is stored locally in this browser and is only ever sent to the Base URL above. Gemini cookies stay on the Web2API server — GlassGem never sees them.</p>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button className="text-[13px] text-fg-subtle hover:text-fg" onClick={finish}>
                Skip for now
              </button>
              <button className="btn-primary h-10 px-5" onClick={finish} disabled={!(tested || connected)}>
                {connected ? <Check size={15} /> : null}
                Start Chatting <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
