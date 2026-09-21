import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { AmbientBackground } from '@/components/background/AmbientBackground'
import { AppLayout } from '@/layouts/AppLayout'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { DialogHost } from '@/components/dialogs/DialogHost'
import { useTheme, useIsDark } from '@/hooks/useTheme'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useConnectionMonitor } from '@/hooks/useConnectionMonitor'
import { useConversations } from '@/stores/conversationStore'
import { usePrompts } from '@/stores/promptStore'
import { toast } from '@/hooks/useToast'

export default function App() {
  useTheme()
  useKeyboardShortcuts()
  useConnectionMonitor()
  const dark = useIsDark()

  useEffect(() => {
    useConversations
      .getState()
      .load()
      .catch((e: Error) => toast.error('Could not open local storage', e.message))
    usePrompts
      .getState()
      .load()
      .catch(() => undefined)
  }, [])

  return (
    <TooltipProvider>
      <AmbientBackground />
      <AppLayout />
      <DialogHost />
      <Toaster
        position="bottom-right"
        theme={dark ? 'dark' : 'light'}
        offset={16}
        gap={8}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: 'glass-float flex w-[340px] items-start gap-3 rounded-(--radius-lg) px-4 py-3 text-[13.5px] text-fg',
            title: 'font-medium',
            description: 'text-fg-muted text-[12.5px] mt-0.5',
            icon: 'mt-0.5 shrink-0 text-fg-muted',
            success: '[&_[data-icon]]:text-success',
            error: '[&_[data-icon]]:text-danger',
            info: '[&_[data-icon]]:text-accent',
            warning: '[&_[data-icon]]:text-warning',
          },
        }}
      />
    </TooltipProvider>
  )
}
