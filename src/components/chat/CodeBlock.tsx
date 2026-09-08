import { memo, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyToClipboard } from '@/lib/utils'

const LANG_LABELS: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX',
  py: 'Python', python: 'Python', html: 'HTML', xml: 'XML', css: 'CSS', scss: 'SCSS', json: 'JSON', bash: 'Bash', sh: 'Shell',
  shell: 'Shell', zsh: 'Zsh', powershell: 'PowerShell', ps1: 'PowerShell', pwsh: 'PowerShell', sql: 'SQL', cpp: 'C++', c: 'C',
  cs: 'C#', csharp: 'C#', java: 'Java', go: 'Go', golang: 'Go', rust: 'Rust', rs: 'Rust', kotlin: 'Kotlin', swift: 'Swift',
  php: 'PHP', ruby: 'Ruby', rb: 'Ruby', yaml: 'YAML', yml: 'YAML', toml: 'TOML', md: 'Markdown', markdown: 'Markdown',
  dockerfile: 'Dockerfile', docker: 'Dockerfile', diff: 'Diff', graphql: 'GraphQL', ini: 'INI', makefile: 'Makefile', text: 'Text', plaintext: 'Text',
}

export const CodeBlock = memo(function CodeBlock({ language, code, children }: { language?: string; code: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const label = language ? (LANG_LABELS[language.toLowerCase()] ?? language) : 'Code'

  const copy = async () => {
    if (await copyToClipboard(code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className="code-block not-prose">
      <div className="code-block-head">
        <span className="font-medium tracking-wide">{label}</span>
        <button className="code-copy-btn" onClick={() => void copy()} aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      {children}
    </div>
  )
})
