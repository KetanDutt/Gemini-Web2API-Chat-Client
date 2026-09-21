import { GlassDialog } from '@/components/ui/Dialog'
import { Kbd } from '@/components/ui/Kbd'
import { useUI } from '@/stores/uiStore'

const GROUPS = [
  {
    title: 'Navigation',
    items: [
      ['Search conversations', 'Mod+K'],
      ['New chat', 'Mod+N'],
      ['Toggle sidebar', 'Mod+B'],
      ['Settings', 'Mod+Shift+S'],
      ['Prompt library', 'Mod+Shift+P'],
      ['Keyboard shortcuts', 'Mod+Shift+/'],
      ['Close dialog / sidebar', 'Esc'],
    ],
  },
  {
    title: 'Composer',
    items: [
      ['Focus composer', 'Mod+/'],
      ['Send message', '↵'],
      ['Send (always)', 'Mod+↵'],
      ['New line', '⇧+↵'],
      ['Paste / drag images', 'Clipboard or drop'],
    ],
  },
  {
    title: 'Conversations',
    items: [
      ['Stop generating', 'Esc'],
      ['Rename', 'Double-click title'],
    ],
  },
]

export function ShortcutsDialog() {
  const open = useUI((s) => s.dialog === 'shortcuts')
  const closeDialog = useUI((s) => s.closeDialog)
  return (
    <GlassDialog open={open} onOpenChange={(o) => !o && closeDialog()} title="Keyboard shortcuts" size="md">
      <div className="grid gap-5 px-6 pb-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="eyebrow mb-2">{g.title}</h3>
            <ul className="space-y-1.5">
              {g.items.map(([label, keys]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-[13.5px]">
                  <span className="text-fg-muted">{label}</span>
                  {keys.includes('+') || keys.length <= 2 ? <Kbd keys={keys} /> : <span className="text-[12px] text-fg-subtle">{keys}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </GlassDialog>
  )
}
