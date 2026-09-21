import { useEffect } from 'react'
import { useUI } from '@/stores/uiStore'
import { useConversations } from '@/stores/conversationStore'

export const COMPOSER_FOCUS_EVENT = 'glassgem:focus-composer'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const ui = useUI.getState()
      const key = e.key.toLowerCase()

      if (mod && key === 'k') {
        e.preventDefault()
        ui.dialog === 'search' ? ui.closeDialog() : ui.openDialog('search')
        return
      }
      if (mod && !e.shiftKey && key === 'n') {
        e.preventDefault()
        void useConversations.getState().createConversation()
        ui.closeDialog()
        ui.setDrawerOpen(false)
        return
      }
      if (mod && e.shiftKey && key === 's') {
        e.preventDefault()
        ui.dialog === 'settings' ? ui.closeDialog() : ui.openDialog('settings')
        return
      }
      if (mod && key === '/') {
        e.preventDefault()
        if (e.shiftKey) {
          ui.openDialog('shortcuts')
        } else {
          ui.closeDialog()
          window.dispatchEvent(new CustomEvent(COMPOSER_FOCUS_EVENT))
        }
        return
      }
      if (mod && key === 'b') {
        e.preventDefault()
        ui.toggleSidebar()
        return
      }
      if (mod && key === 'p' && e.shiftKey) {
        e.preventDefault()
        ui.dialog === 'prompts' ? ui.closeDialog() : ui.openDialog('prompts')
        return
      }
      if (e.key === 'Escape') {
        if (ui.dialog) {
          ui.closeDialog()
          return
        }
        if (ui.drawerOpen) {
          ui.setDrawerOpen(false)
          return
        }
        if (ui.renamingId) {
          ui.setRenaming(null)
          return
        }
        const conv = useConversations.getState()
        if (conv.editingMessageId) {
          conv.setEditing(null)
          return
        }
        // Escape also stops a running generation in the active conversation.
        if (conv.activeId && conv.generating[conv.activeId]) {
          conv.stopGeneration(conv.activeId)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
