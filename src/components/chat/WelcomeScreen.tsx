import { Code2, Lightbulb, ListChecks, MessageCircleQuestion, Sparkles } from 'lucide-react'
import { GemMark } from '@/components/layout/Logo'
import { useUI } from '@/stores/uiStore'
import { useConnection } from '@/stores/connectionStore'
import { WifiOff } from 'lucide-react'

const SUGGESTIONS = [
  { icon: MessageCircleQuestion, title: 'Explain something', prompt: 'Explain how ', hint: 'Clear explanations at any depth' },
  { icon: Code2, title: 'Write code', prompt: 'Write a TypeScript function that ', hint: 'Snippets, reviews, refactors' },
  { icon: Lightbulb, title: 'Analyze an idea', prompt: 'Analyze this idea and give me the strongest arguments for and against it:\n\n', hint: 'Pros, cons, blind spots' },
  { icon: ListChecks, title: 'Help me plan', prompt: 'Help me plan ', hint: 'Steps, timelines, priorities' },
  { icon: Sparkles, title: 'Brainstorm with me', prompt: 'Brainstorm 10 creative ideas for ', hint: 'Divergent, playful thinking' },
]

export function WelcomeScreen() {
  const insert = useUI((s) => s.insertIntoComposer)
  const openDialog = useUI((s) => s.openDialog)
  const state = useConnection((s) => s.state)

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-10 animate-rise">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] border border-line bg-surface-2 shadow-[0_20px_50px_-20px_var(--accent-glow)]">
        <GemMark size={40} />
      </div>
      <h1 className="text-center text-[30px] font-semibold tracking-tight sm:text-[36px]">
        <span className="text-gradient">GlassGem</span>
      </h1>
      <p className="mt-2 text-center text-[16px] text-fg-muted">Your personal Gemini workspace.</p>

      {(state === 'offline' || state === 'error') && (
        <button
          onClick={() => openDialog('settings', 'api')}
          className="mt-5 flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-3.5 py-1.5 text-[13px] text-fg transition-colors hover:bg-danger/15"
        >
          <WifiOff size={14} className="text-danger" />
          Web2API is offline — check the connection
        </button>
      )}

      <div className="mt-9 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            onClick={() => insert(s.prompt)}
            className="glass glass-2 glass-hover group flex flex-col items-start gap-2 rounded-[20px] p-4 text-left hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <s.icon size={16} />
            </span>
            <span className="text-[14px] font-medium">{s.title}</span>
            <span className="text-[12.5px] text-fg-subtle">{s.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
