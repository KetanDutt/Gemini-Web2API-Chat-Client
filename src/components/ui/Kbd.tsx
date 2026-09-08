import { modKey } from '@/lib/utils'

export function Kbd({ keys }: { keys: string }) {
  const parts = keys.replace('Mod', modKey()).split('+')
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((p, i) => (
        <kbd key={i} className="kbd">
          {p}
        </kbd>
      ))}
    </span>
  )
}
