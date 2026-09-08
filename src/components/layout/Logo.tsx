import { cn } from '@/lib/utils'

export function GemMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id="gg-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9ec5ff" />
          <stop offset="0.5" stopColor="#7c8cff" />
          <stop offset="1" stopColor="#c58cff" />
        </linearGradient>
        <linearGradient id="gg-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M32 6 L54 26 L32 58 L10 26 Z" fill="url(#gg-gem)" />
      <path d="M32 6 L54 26 L32 31 L10 26 Z" fill="#fff" opacity="0.25" />
      <path d="M10 26 L32 31 L32 58 Z" fill="#000" opacity="0.14" />
      <path d="M32 6 L22 26 L32 31 L42 26 Z" fill="url(#gg-shine)" opacity="0.7" />
    </svg>
  )
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-line bg-surface-2 shadow-[0_4px_16px_-6px_var(--accent-glow)]">
        <GemMark size={20} />
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">GlassGem</span>}
    </div>
  )
}
