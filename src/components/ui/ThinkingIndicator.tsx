export function ThinkingIndicator({ label = 'Gemini is thinking…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13.5px] text-fg-muted" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5" aria-hidden>
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
      <span>{label}</span>
    </div>
  )
}
