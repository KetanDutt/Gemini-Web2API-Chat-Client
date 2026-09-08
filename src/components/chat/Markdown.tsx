import { memo, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { CodeBlock } from './CodeBlock'
import { cn } from '@/lib/utils'

type PreProps = ComponentProps<'pre'> & { node?: unknown }

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

function Pre({ children, ...rest }: PreProps) {
  // children is a single <code className="hljs language-xxx">
  let language: string | undefined
  const child = Array.isArray(children) ? children[0] : children
  if (child && typeof child === 'object' && 'props' in child) {
    const cls: string = ((child as { props: { className?: string } }).props.className ?? '') as string
    const m = /language-([\w+#-]+)/.exec(cls)
    if (m) language = m[1]
  }
  const code = extractText(children).replace(/\n$/, '')
  return (
    <CodeBlock language={language} code={code}>
      <pre {...rest}>{children}</pre>
    </CodeBlock>
  )
}

const components: ComponentProps<typeof ReactMarkdown>['components'] = {
  pre: Pre,
  a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: ({ node: _n, ...props }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
  input: ({ node: _n, ...props }) => <input {...props} disabled readOnly />,
}

const remarkPlugins = [remarkGfm]
const rehypePlugins = [[rehypeHighlight, { detect: false, ignoreMissing: true }] as const]

export const Markdown = memo(function Markdown({ content, className, streaming }: { content: string; className?: string; streaming?: boolean }) {
  return (
    <div className={cn('prose-gem', streaming && 'streaming-caret', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins as never} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
})
