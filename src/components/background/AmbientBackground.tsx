import { memo } from 'react'

/**
 * Sophisticated, extremely subtle animated ambient background.
 * Pure CSS so it costs nothing on the main thread. Motion is disabled by the
 * global reduced-motion rules.
 */
export const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 800px at 15% 10%, var(--bg-2), transparent 60%), radial-gradient(1000px 700px at 85% 90%, var(--bg-2), transparent 60%)',
        }}
      />
      <div
        className="absolute animate-blob rounded-full"
        style={{ width: '55vmax', height: '55vmax', left: '-12vmax', top: '-18vmax', background: 'var(--blob-1)', filter: 'blur(90px)', animationDuration: '32s' }}
      />
      <div
        className="absolute animate-blob rounded-full"
        style={{ width: '48vmax', height: '48vmax', right: '-14vmax', top: '10vmax', background: 'var(--blob-2)', filter: 'blur(100px)', animationDuration: '38s', animationDelay: '-9s' }}
      />
      <div
        className="absolute animate-blob rounded-full"
        style={{ width: '42vmax', height: '42vmax', left: '25vmax', bottom: '-22vmax', background: 'var(--blob-3)', filter: 'blur(110px)', animationDuration: '44s', animationDelay: '-18s' }}
      />
      <div
        className="absolute animate-blob rounded-full"
        style={{ width: '30vmax', height: '30vmax', right: '20vmax', bottom: '5vmax', background: 'var(--blob-4)', filter: 'blur(90px)', animationDuration: '50s', animationDelay: '-25s' }}
      />
      {/* fine noise for a "material" feel */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
})
