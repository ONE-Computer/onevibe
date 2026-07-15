import type { ReactNode } from 'react'

const tokenPattern = /(\/\/[^\n]*|#[^\n]*|<!--[\s\S]*?-->|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`|\b(?:const|let|var|function|return|async|await|if|else|for|while|import|from|export|default|type|interface|extends|class|new|true|false|null|undefined|try|catch|throw|public|private|readonly)\b|\b\d+(?:\.\d+)?\b)/g

const highlight = (line: string): ReactNode[] => {
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const match of line.matchAll(tokenPattern)) {
    const value = match[0]
    const start = match.index ?? cursor
    if (start > cursor) nodes.push(line.slice(cursor, start))
    const type = value.startsWith('//') || value.startsWith('#') || value.startsWith('<!--') ? 'comment' : value.startsWith('"') || value.startsWith("'") || value.startsWith('`') ? 'string' : /^\d/.test(value) ? 'number' : 'keyword'
    nodes.push(<span className={`syntax-${type}`} key={`${start}-${value}`}>{value}</span>)
    cursor = start + value.length
  }
  if (cursor < line.length) nodes.push(line.slice(cursor))
  return nodes
}

export const HighlightedCode = ({ content }: { content: string }) => <pre className="highlighted-code"><code>{content.split('\n').map((line, index) => <span className="code-line" key={`${index}-${line}`}><i>{String(index + 1).padStart(3, ' ')}</i><span>{highlight(line)}</span></span>)}</code></pre>
