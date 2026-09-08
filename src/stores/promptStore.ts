import { create } from 'zustand'
import { db } from '@/services/db'
import type { PromptCategory, SavedPrompt } from '@/types'
import { uid } from '@/lib/utils'

export const PROMPT_CATEGORIES: PromptCategory[] = ['Coding', 'Writing', 'Research', 'Business', 'Learning', 'Personal']

interface PromptStore {
  prompts: SavedPrompt[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: Omit<SavedPrompt, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SavedPrompt>
  update: (id: string, patch: Partial<SavedPrompt>) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  importPrompts: (items: SavedPrompt[]) => Promise<number>
  clear: () => Promise<void>
}

const STARTER_PROMPTS: Array<Omit<SavedPrompt, 'id' | 'createdAt' | 'updatedAt'>> = [
  { name: 'Code review', description: 'Thorough review with concrete fixes', category: 'Coding', favorite: true, text: 'Review the following code for bugs, readability, performance and security issues. For each problem, explain why it matters and show the corrected code.\n\n```\n\n```' },
  { name: 'Explain like a senior engineer', description: 'Deep, precise technical explanation', category: 'Learning', favorite: false, text: 'Explain the following concept the way a senior engineer would explain it to a strong junior: start with the mental model, then the details, then common pitfalls. Topic: ' },
  { name: 'Rewrite for clarity', description: 'Tighten prose without changing meaning', category: 'Writing', favorite: false, text: 'Rewrite the following text to be clearer and more concise while preserving its meaning and tone. Then list the three most important changes you made.\n\n' },
  { name: 'Structured research brief', description: 'Balanced overview with open questions', category: 'Research', favorite: false, text: 'Give me a structured research brief on the topic below: key facts, main viewpoints, notable uncertainties, and five questions worth investigating further.\n\nTopic: ' },
  { name: 'Meeting → action items', description: 'Turn notes into owners and deadlines', category: 'Business', favorite: false, text: 'Turn these meeting notes into a concise summary followed by a table of action items with owner, deadline and priority:\n\n' },
  { name: 'Weekly plan', description: 'Realistic plan with buffers', category: 'Personal', favorite: false, text: 'Help me plan my week. Here are my goals and fixed commitments. Propose a realistic schedule with buffers and one suggestion for what to drop.\n\n' },
]

export const usePrompts = create<PromptStore>()((set, get) => ({
  prompts: [],
  loaded: false,

  load: async () => {
    let prompts = await db.prompts.toArray()
    if (prompts.length === 0 && !localStorage.getItem('glassgem.promptsSeeded')) {
      const now = Date.now()
      prompts = STARTER_PROMPTS.map((p, i) => ({ ...p, id: uid('prompt'), createdAt: now - i, updatedAt: now - i }))
      await db.prompts.bulkAdd(prompts)
      localStorage.setItem('glassgem.promptsSeeded', '1')
    }
    set({ prompts: prompts.sort((a, b) => b.updatedAt - a.updatedAt), loaded: true })
  },

  create: async (input) => {
    const now = Date.now()
    const prompt: SavedPrompt = { ...input, id: uid('prompt'), createdAt: now, updatedAt: now }
    await db.prompts.add(prompt)
    set((s) => ({ prompts: [prompt, ...s.prompts] }))
    return prompt
  },

  update: async (id, patch) => {
    const full = { ...patch, updatedAt: Date.now() }
    await db.prompts.update(id, full)
    set((s) => ({ prompts: s.prompts.map((p) => (p.id === id ? { ...p, ...full } : p)) }))
  },

  remove: async (id) => {
    await db.prompts.delete(id)
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }))
  },

  toggleFavorite: async (id) => {
    const p = get().prompts.find((x) => x.id === id)
    if (p) await get().update(id, { favorite: !p.favorite })
  },

  importPrompts: async (items) => {
    if (!items.length) return 0
    await db.prompts.bulkAdd(items)
    set((s) => ({ prompts: [...items, ...s.prompts] }))
    return items.length
  },

  clear: async () => {
    await db.prompts.clear()
    set({ prompts: [] })
  },
}))
