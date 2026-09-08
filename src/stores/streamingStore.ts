import { create } from 'zustand'
import { useSyncExternalStore } from 'react'

/**
 * Streaming text lives outside the main conversation store so that each token
 * only re-renders the single message component that subscribes to it — not the
 * whole message list.
 */
interface StreamingState {
  buffers: Map<string, string>
  start: (id: string) => void
  push: (id: string, full: string) => void
  get: (id: string) => string | undefined
  clear: (id: string) => void
}

const listeners = new Map<string, Set<() => void>>()
const buffers = new Map<string, string>()

function notify(id: string) {
  listeners.get(id)?.forEach((l) => l())
}

export const useStreaming = create<StreamingState>()(() => ({
  buffers,
  start: (id) => {
    buffers.set(id, '')
    notify(id)
  },
  push: (id, full) => {
    buffers.set(id, full)
    notify(id)
  },
  get: (id) => buffers.get(id),
  clear: (id) => {
    buffers.delete(id)
    notify(id)
  },
}))

// Throttle notifications to animation frames to avoid layout thrash on fast streams.
let rafId: number | null = null
const pending = new Set<string>()
const origPush = useStreaming.getState().push
useStreaming.setState({
  push: (id, full) => {
    buffers.set(id, full)
    pending.add(id)
    if (rafId == null) {
      rafId = requestAnimationFrame(() => {
        rafId = null
        pending.forEach((p) => notify(p))
        pending.clear()
      })
    }
  },
})
void origPush

/** Subscribe a single component to one message's streaming buffer. */
export function useStreamingText(id: string): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      let set = listeners.get(id)
      if (!set) {
        set = new Set()
        listeners.set(id, set)
      }
      set.add(cb)
      return () => {
        set!.delete(cb)
        if (set!.size === 0) listeners.delete(id)
      }
    },
    () => buffers.get(id),
    () => undefined,
  )
}
