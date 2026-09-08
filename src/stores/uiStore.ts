import { create } from 'zustand'

export type DialogName = 'settings' | 'search' | 'shortcuts' | 'prompts' | 'onboarding' | 'debug' | 'import' | null
export type SettingsTab = 'general' | 'api' | 'chat' | 'prompts' | 'privacy' | 'data' | 'about'

interface UIState {
  sidebarOpen: boolean // desktop collapsed state
  drawerOpen: boolean // mobile drawer
  dialog: DialogName
  settingsTab: SettingsTab
  composerDraft: string
  composerInsertNonce: number
  pendingConversationDelete: string | null
  renamingId: string | null
  systemPromptEditorOpen: boolean

  toggleSidebar: () => void
  setSidebarOpen: (v: boolean) => void
  setDrawerOpen: (v: boolean) => void
  openDialog: (d: Exclude<DialogName, null>, tab?: SettingsTab) => void
  closeDialog: () => void
  setSettingsTab: (t: SettingsTab) => void
  insertIntoComposer: (text: string) => void
  setComposerDraft: (text: string) => void
  requestDelete: (id: string | null) => void
  setRenaming: (id: string | null) => void
  setSystemPromptEditorOpen: (v: boolean) => void
}

export const useUI = create<UIState>()((set) => ({
  sidebarOpen: localStorage.getItem('glassgem.sidebar') !== 'closed',
  drawerOpen: false,
  dialog: null,
  settingsTab: 'general',
  composerDraft: '',
  composerInsertNonce: 0,
  pendingConversationDelete: null,
  renamingId: null,
  systemPromptEditorOpen: false,

  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarOpen
      localStorage.setItem('glassgem.sidebar', next ? 'open' : 'closed')
      return { sidebarOpen: next }
    }),
  setSidebarOpen: (v) => {
    localStorage.setItem('glassgem.sidebar', v ? 'open' : 'closed')
    set({ sidebarOpen: v })
  },
  setDrawerOpen: (v) => set({ drawerOpen: v }),
  openDialog: (d, tab) => set((s) => ({ dialog: d, settingsTab: tab ?? s.settingsTab })),
  closeDialog: () => set({ dialog: null }),
  setSettingsTab: (t) => set({ settingsTab: t }),
  insertIntoComposer: (text) => set((s) => ({ composerDraft: text, composerInsertNonce: s.composerInsertNonce + 1 })),
  setComposerDraft: (text) => set({ composerDraft: text }),
  requestDelete: (id) => set({ pendingConversationDelete: id }),
  setRenaming: (id) => set({ renamingId: id }),
  setSystemPromptEditorOpen: (v) => set({ systemPromptEditorOpen: v }),
}))
