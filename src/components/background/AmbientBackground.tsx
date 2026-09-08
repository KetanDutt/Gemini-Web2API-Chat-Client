import { memo } from 'react'

/**
 * Near-invisible ambient background: a neutral base, two very soft colour
 * fields that drift over a minute (transform only), and a fine grain.
 * There are no visible "blobs" — the glass surfaces above pick up the tint.
 */
export const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-(--bg)">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1400px 900px at 10% 0%, var(--bg-2), transparent 62%), radial-gradient(1200px 800px at 100% 100%, var(--bg-2), transparent 60%)',
        }}
      />
      <div
        className="animate-drift absolute will-change-transform"
        style={{
          inset: '-20%',
          background:
            'radial-gradient(60% 50% at 20% 20%, var(--tint-a), transparent 70%), radial-gradient(45% 45% at 80% 30%, var(--tint-b), transparent 70%), radial-gradient(50% 40% at 55% 90%, var(--tint-c), transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.028] mix-blend-overlay dark:opacity-[0.05]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
})
