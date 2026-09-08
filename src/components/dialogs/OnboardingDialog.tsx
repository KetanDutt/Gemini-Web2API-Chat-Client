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
        <DialogPrimitive.Overlay className="motion-fade fixed inset-0 z-(--z-dialog) bg-(--scrim) backdrop-blur-[4px]" />
        <DialogPrimitive.Content
          className="glass-lg motion-dialog fixed left-1/2 top-1/2 z-(--z-dialog) flex max-h-[90dvh] w-[calc(100vw-20px)] max-w-lg flex-col overflow-hidden rounded-(--radius-2xl) outline-none"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="relative z-1 overflow-y-auto px-7 pb-6 pt-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-(--radius-md) bg-surface-2 shadow-[inset_0_0_0_1px_var(--glass-edge),var(--shadow-sm)]">
                <GemMark size={28} />
              </span>
              <div>
                <DialogPrimitive.Title className="text-[20px] font-semibold tracking-tight">Connect to Gemini Web2API</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-fg-muted">GlassGem runs entirely on this computer and talks to your local server.</DialogPrimitive.Description>
              </div>
            </div>

            <ApiForm compact onConnected={() => setTested(true)} />

            <div className="group-panel mt-5 flex items-start gap-2.5 p-3 text-[12.5px] text-fg-muted">
              <Shield size={15} className="mt-0.5 shrink-0 text-accent" />
              <p>Your API key is stored locally in this browser and is only ever sent to the Base URL above. Gemini cookies stay on the Web2API server — GlassGem never sees them.</p>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button className="btn btn-ghost" onClick={finish}>
                Skip for now
              </button>
              <button className="btn btn-primary btn-lg" onClick={finish} disabled={!(tested || connected)}>
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
