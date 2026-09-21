import { Suspense, lazy, useEffect, useState, type LazyExoticComponent, type ComponentType } from 'react'
import { useUI, type DialogName } from '@/stores/uiStore'
import { useSettings } from '@/stores/settingsStore'

/**
 * Hosts every top-level dialog. Dialogs are split into separate chunks and
 * fetched only the first time they are actually opened; once loaded, they
 * stay mounted (sticky) so their close animations and internal state survive.
 * This keeps the initial bundle lean without changing any dialog's behavior.
 */

const SettingsDialog = lazy(() => import('./SettingsDialog').then((m) => ({ default: m.SettingsDialog })))
const SearchDialog = lazy(() => import('./SearchDialog').then((m) => ({ default: m.SearchDialog })))
const ShortcutsDialog = lazy(() => import('./ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog })))
const PromptLibraryDialog = lazy(() => import('./PromptLibraryDialog').then((m) => ({ default: m.PromptLibraryDialog })))
const DebugDialog = lazy(() => import('./DebugDialog').then((m) => ({ default: m.DebugDialog })))
const OnboardingDialog = lazy(() => import('./OnboardingDialog').then((m) => ({ default: m.OnboardingDialog })))
const DeleteConversationDialog = lazy(() => import('./DeleteConversationDialog').then((m) => ({ default: m.DeleteConversationDialog })))
const PwaPrompt = lazy(() => import('@/components/layout/PwaPrompt').then((m) => ({ default: m.PwaPrompt })))

/** Mounts `component` the first time `open` becomes true, then keeps it mounted. */
function StickyMount({ open, component: Component }: { open: boolean; component: LazyExoticComponent<ComponentType> }) {
  const [everOpened, setEverOpened] = useState(open)
  useEffect(() => {
    if (open) setEverOpened(true)
  }, [open])
  if (!everOpened) return null
  return <Component />
}

export function DialogHost() {
  const dialog = useUI((s) => s.dialog)
  const pendingDelete = useUI((s) => s.pendingConversationDelete)
  const onboarded = useSettings((s) => s.onboarded)

  const isOpen = (name: Exclude<DialogName, null>) => dialog === name

  return (
    <Suspense fallback={null}>
      <StickyMount open={!onboarded} component={OnboardingDialog} />
      <StickyMount open={isOpen('settings')} component={SettingsDialog} />
      <StickyMount open={isOpen('search')} component={SearchDialog} />
      <StickyMount open={isOpen('shortcuts')} component={ShortcutsDialog} />
      <StickyMount open={isOpen('prompts')} component={PromptLibraryDialog} />
      <StickyMount open={isOpen('debug')} component={DebugDialog} />
      <StickyMount open={pendingDelete != null} component={DeleteConversationDialog} />
      <StickyMount open component={PwaPrompt} />
    </Suspense>
  )
}
