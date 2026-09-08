import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { AmbientBackground } from '@/components/background/AmbientBackground'
import { AppLayout } from '@/layouts/AppLayout'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { SearchDialog } from '@/components/dialogs/SearchDialog'
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog'
import { PromptLibraryDialog } from '@/components/dialogs/PromptLibraryDialog'
import { OnboardingDialog } from '@/components/dialogs/OnboardingDialog'
import { DebugDialog } from '@/components/dialogs/DebugDialog'
import { DeleteConversationDialog } from '@/components/dialogs/DeleteConversationDialog'
import { PwaPrompt } from '@/components/layout/PwaPrompt'
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
      <SettingsDialog />
      <SearchDialog />
      <ShortcutsDialog />
      <PromptLibraryDialog />
      <DebugDialog />
      <DeleteConversationDialog />
      <OnboardingDialog />
      <PwaPrompt />
      <Toaster
        position="bottom-right"
        theme={dark ? 'dark' : 'light'}
        offset={16}
        gap={8}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: 'glass glass-4 flex w-[340px] items-start gap-3 rounded-2xl px-4 py-3 text-[13.5px]',
            title: 'font-medium',
            description: 'text-fg-muted text-[12.5px] mt-0.5',
            icon: 'mt-0.5 shrink-0',
            success: '[&_[data-icon]]:text-success',
            error: '[&_[data-icon]]:text-danger',
          },
        }}
      />
    </TooltipProvider>
  )
}
