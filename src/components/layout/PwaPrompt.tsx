import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from '@/hooks/useToast'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaPrompt() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('glassgem.installDismissed') === '1')
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisterError() {
      /* service worker is optional */
    },
  })

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (needRefresh[0]) {
      toast.info('Update available', 'Reload GlassGem to get the latest version.')
    }
  }, [needRefresh])

  if (needRefresh[0]) {
    return (
      <div className="glass glass-3 fixed bottom-4 left-4 z-[70] flex items-center gap-3 rounded-2xl px-3.5 py-2 text-[13px] animate-rise max-sm:hidden">
        <span>A new version of GlassGem is ready.</span>
        <button className="btn-primary h-7 px-3 text-xs" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
      </div>
    )
  }

  if (!installEvt || dismissed) return null

  return (
    <div className="glass glass-3 fixed bottom-4 left-4 z-[70] flex items-center gap-2 rounded-2xl py-1.5 pl-3.5 pr-1.5 text-[13px] animate-rise max-sm:hidden">
      <Download size={14} className="text-accent" />
      <span>Install GlassGem as an app</span>
      <button
        className="btn-primary ml-1 h-7 px-3 text-xs"
        onClick={async () => {
          await installEvt.prompt()
          const { outcome } = await installEvt.userChoice
          if (outcome === 'accepted') toast.success('GlassGem installed')
          setInstallEvt(null)
        }}
      >
        Install
      </button>
      <button
        className="icon-btn h-7 w-7"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem('glassgem.installDismissed', '1')
          setDismissed(true)
        }}
      >
        <X size={13} />
      </button>
    </div>
  )
}
