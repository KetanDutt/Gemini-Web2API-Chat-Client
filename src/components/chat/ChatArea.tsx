import { useState } from 'react'
import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { Composer } from './Composer'

export function ChatArea() {
  const [scrolled, setScrolled] = useState(false)
  return (
    <main className="glass-sm flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-(--radius-xl)" aria-label="Chat">
      <ChatHeader scrolled={scrolled} />
      <MessageList onScrolledChange={setScrolled} />
      <Composer />
    </main>
  )
}
