import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from '@/hooks/useToast'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** PWA controls are intentionally not mounted in the native Electron shell. */
export function PwaPrompt() {
  if (typeof window !== 'undefined' && window.glassgem?.isDesktop) return null
  return <BrowserPwaPrompt />
}

function BrowserPwaPrompt() {
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
      <div className="glass-float enter-rise fixed bottom-4 left-4 z-(--z-toast) flex items-center gap-3 rounded-(--radius-md) px-3.5 py-2 text-[13px] max-sm:hidden">
        <span>A new version of GlassGem is ready.</span>
        <button className="btn btn-primary btn-sm h-7" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
      </div>
    )
  }

  if (!installEvt || dismissed) return null

  return (
    <div className="glass-float enter-rise fixed bottom-4 left-4 z-(--z-toast) flex items-center gap-2 rounded-(--radius-md) py-1.5 pl-3.5 pr-1.5 text-[13px] max-sm:hidden">
      <Download size={14} className="text-accent" />
      <span>Install GlassGem as an app</span>
      <button
        className="btn btn-primary btn-sm ml-1 h-7"
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
        className="icon-btn icon-btn-xs"
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
