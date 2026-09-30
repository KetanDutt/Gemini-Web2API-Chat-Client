import { useMemo, useState } from 'react'
import { BookMarked, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { GlassDialog } from '@/components/ui/Dialog'
import { useUI } from '@/stores/uiStore'
import { PROMPT_CATEGORIES, usePrompts } from '@/stores/promptStore'
import type { PromptCategory, SavedPrompt } from '@/types'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from '@/hooks/useToast'

export function PromptLibraryDialog() {
  const open = useUI((s) => s.dialog === 'prompts')
  const closeDialog = useUI((s) => s.closeDialog)
  return (
    <GlassDialog open={open} onOpenChange={(o) => !o && closeDialog()} title="Prompt library" description="Reusable prompts — click one to insert it into the composer." size="lg" className="h-[min(85dvh,680px)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
        <PromptLibraryPanel />
      </div>
    </GlassDialog>
  )
}

type Draft = { id?: string; name: string; description: string; text: string; category: PromptCategory; favorite: boolean }
const emptyDraft = (): Draft => ({ name: '', description: '', text: '', category: 'Coding', favorite: false })

export function PromptLibraryPanel({ embedded }: { embedded?: boolean }) {
  const prompts = usePrompts((s) => s.prompts)
  const create = usePrompts((s) => s.create)
  const update = usePrompts((s) => s.update)
  const remove = usePrompts((s) => s.remove)
  const toggleFavorite = usePrompts((s) => s.toggleFavorite)
  const insert = useUI((s) => s.insertIntoComposer)
  const closeDialog = useUI((s) => s.closeDialog)
  const [category, setCategory] = useState<PromptCategory | 'All' | 'Favorites'>('All')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return prompts
      .filter((p) => (category === 'All' ? true : category === 'Favorites' ? p.favorite : p.category === category))
      .filter((p) => !query || p.name.toLowerCase().includes(query) || p.text.toLowerCase().includes(query) || p.description?.toLowerCase().includes(query))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt)
  }, [prompts, category, q])

  const use = (p: SavedPrompt) => {
    insert(p.text)
    // The standalone dialog closes so you can use the composer right away;
    // the panel embedded in Settings stays open for browsing.
    if (!embedded) closeDialog()
    toast.success('Prompt inserted')
  }

  const save = async () => {
    if (!draft || !draft.name.trim() || !draft.text.trim()) return
    if (draft.id) {
      await update(draft.id, { name: draft.name.trim(), description: draft.description.trim() || undefined, text: draft.text, category: draft.category, favorite: draft.favorite })
      toast.success('Prompt updated')
    } else {
      await create({ name: draft.name.trim(), description: draft.description.trim() || undefined, text: draft.text, category: draft.category, favorite: draft.favorite })
      toast.success('Prompt saved')
    }
    setDraft(null)
  }

  if (draft) {
    return (
      <div className="enter-rise">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">{draft.id ? 'Edit prompt' : 'New prompt'}</h3>
          <button className="icon-btn icon-btn-sm" onClick={() => setDraft(null)} aria-label="Cancel">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium">Name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="field h-10 py-0" placeholder="Code review" autoFocus />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium">Category</span>
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as PromptCategory })} className="field h-10 cursor-pointer py-0">
                {PROMPT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium">Description <span className="text-fg-subtle">(optional)</span></span>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="field h-10 py-0" placeholder="What this prompt is good for" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium">Prompt text</span>
            <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={7} className="field resize-y text-[14px] leading-relaxed" placeholder="Review the following code…" />
          </label>
          <div className="flex items-center justify-between">
            <button type="button" className={cn('pill pill-interactive h-8', draft.favorite && 'pill-on')} onClick={() => setDraft({ ...draft, favorite: !draft.favorite })} aria-pressed={draft.favorite}>
              <Star size={12} className={cn('star-toggle', draft.favorite && 'is-on fill-warning text-warning')} /> Favorite
            </button>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void save()} disabled={!draft.name.trim() || !draft.text.trim()}>
                {draft.id ? 'Save changes' : 'Save prompt'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts" className="field h-9 py-0 pl-9 text-[13.5px]" aria-label="Search prompts" />
        </div>
        <button className="btn btn-primary h-9" onClick={() => setDraft(emptyDraft())}>
          <Plus size={15} /> New prompt
        </button>
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {(['All', 'Favorites', ...PROMPT_CATEGORIES] as const).map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={cn('pill pill-interactive shrink-0', category === c && 'pill-on')} aria-pressed={category === c}>
            {c === 'Favorites' && <Star size={11} />}
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookMarked size={20} />}
          title={prompts.length === 0 ? 'Your library is empty' : 'No prompts match'}
          description={prompts.length === 0 ? 'Save the prompts you keep retyping and insert them with one click.' : 'Try another category or search term.'}
          action={prompts.length === 0 ? <button className="btn btn-secondary" onClick={() => setDraft(emptyDraft())}><Plus size={14} /> Create a prompt</button> : undefined}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((p, i) => (
            <li key={p.id} className="group-panel surface-hover enter-rise group relative p-3.5" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <button className="block w-full text-left" onClick={() => use(p)}>
                <div className="flex items-start gap-2 pr-16">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    {p.description && <span className="mt-0.5 block truncate text-[12px] text-fg-muted">{p.description}</span>}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-fg-subtle">{p.text}</p>
                <span className="mt-2 inline-block rounded-(--radius-xs) bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-fg-subtle">{p.category}</span>
              </button>
              <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-(--duration-fast) group-hover:opacity-100 focus-within:opacity-100" style={p.favorite ? { opacity: 1 } : undefined}>
                <button className="icon-btn icon-btn-xs" onClick={() => void toggleFavorite(p.id)} aria-label={p.favorite ? 'Unfavorite' : 'Favorite'} aria-pressed={p.favorite}>
                  <Star size={13} className={cn('star-toggle', p.favorite && 'is-on fill-warning text-warning')} />
                </button>
                <button className="icon-btn icon-btn-xs opacity-0 group-hover:opacity-100" onClick={() => setDraft({ id: p.id, name: p.name, description: p.description ?? '', text: p.text, category: p.category, favorite: p.favorite })} aria-label="Edit prompt">
                  <Pencil size={13} />
                </button>
                <button className="icon-btn icon-btn-xs opacity-0 hover:!text-danger group-hover:opacity-100" onClick={() => { void remove(p.id); toast.success('Prompt deleted') }} aria-label="Delete prompt">
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
