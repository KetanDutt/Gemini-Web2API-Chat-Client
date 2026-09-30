/**
 * "Gemini is thinking…" — a quiet glass capsule with softly pulsing dots.
 * The chip material keeps the indicator part of the same design language as
 * every other floating surface, while staying visually calm.
 */
export function ThinkingIndicator({ label = 'Gemini is thinking…' }: { label?: string }) {
  return (
    <div className="thinking-chip w-fit" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5" aria-hidden>
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
      <span className="text-[13.5px] text-fg-muted">{label}</span>
    </div>
  )
}
