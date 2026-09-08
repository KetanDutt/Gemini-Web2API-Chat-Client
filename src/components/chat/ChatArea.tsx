import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { Composer } from './Composer'

export function ChatArea() {
  return (
    <main className="glass glass-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-glass-lg)]" aria-label="Chat">
      <ChatHeader />
      <MessageList />
      <Composer />
    </main>
  )
}
