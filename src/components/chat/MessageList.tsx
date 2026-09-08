import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { useConversations } from '@/stores/conversationStore'
import { useSettings } from '@/stores/settingsStore'
import { MessageItem } from './MessageItem'
import { WelcomeScreen } from './WelcomeScreen'
import { useStreaming } from '@/stores/streamingStore'
import { cn } from '@/lib/utils'

export function MessageList() {
  const messages = useConversations((s) => s.messages)
  const loading = useConversations((s) => s.loadingMessages)
  const activeId = useConversations((s) => s.activeId)
  const generating = useConversations((s) => (s.activeId ? !!s.generating[s.activeId] : false))
  const showTimestamps = useSettings((s) => s.showTimestamps)
  const showUsage = useSettings((s) => s.showUsage)
  const showLatency = useSettings((s) => s.showLatency)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)

  // Track whether the user is near the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      atBottomRef.current = near
      setAtBottom(near)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Jump to bottom when switching conversations / new messages arrive.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setAtBottom(true)
  }, [activeId, loading])

  // New messages: follow if pinned to bottom, or always when the user just sent one.
  const lastId = messages[messages.length - 1]?.id
  const lastRole = messages[messages.length - 1]?.role
  useEffect(() => {
    if (atBottomRef.current || lastRole === 'user') {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      atBottomRef.current = true
      setAtBottom(true)
    }
  }, [lastId, lastRole])

  // Follow streaming output while pinned to the bottom (rAF-throttled).
  useEffect(() => {
    if (!generating) return
    let raf = 0
    const unsub = useStreaming.subscribe(() => {
      /* noop – buffers are updated outside zustand; we poll below */
    })
    const tick = () => {
      if (atBottomRef.current && scrollRef.current) {
        const el = scrollRef.current
        el.scrollTop = el.scrollHeight
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [generating])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  const visible = messages.filter((m) => m.role !== 'system')

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain px-3 sm:px-6" role="log" aria-live="polite" aria-relevant="additions">
        {loading ? (
          <div className="mx-auto max-w-3xl space-y-6 py-8">
            <div className="ml-auto skeleton h-12 w-2/3" />
            <div className="space-y-2">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          </div>
        ) : visible.length === 0 ? (
          <WelcomeScreen />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col py-6" style={{ gap: 'var(--msg-gap)' }}>
            {visible.map((m, i) => (
              <div key={m.id} className={cn(i >= visible.length - 2 && 'animate-rise')}>
                <MessageItem message={m} showTimestamps={showTimestamps} showUsage={showUsage} showLatency={showLatency} isLast={i === visible.length - 1} generating={generating} />
              </div>
            ))}
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      <button
        onClick={scrollToBottom}
        aria-label="Scroll to latest message"
        className={cn(
          'glass glass-3 absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full text-fg-muted transition-all duration-300 ease-out-expo hover:text-fg',
          atBottom || visible.length === 0 ? 'pointer-events-none translate-y-3 opacity-0' : 'opacity-100',
        )}
      >
        <ArrowDown size={16} />
      </button>
    </div>
  )
}
