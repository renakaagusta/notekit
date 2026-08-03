import * as React from 'react'

import { cn } from '@/utils/cn'

interface BasicMarkdownTextProps {
  children: string
  values?: Record<string, string | number>
  className?: string
}

export function BasicMarkdownText({
  children,
  values,
  className,
}: BasicMarkdownTextProps) {
  const interpolatedText = interpolatePlaceholders(children, values)
  const parsedContent = parseMarkdown(interpolatedText)

  return <p className={cn(className)}>{parsedContent}</p>
}

function parseMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold + Italic: ***text*** (must check before bold and italic)
    const boldItalicMatch = remaining.match(/^\*\*\*(.+?)\*\*\*/)
    if (boldItalicMatch) {
      parts.push(
        <strong key={key++}>
          <em>{parseMarkdown(boldItalicMatch[1])}</em>
        </strong>,
      )
      remaining = remaining.slice(boldItalicMatch[0].length)
      continue
    }

    // Bold: **text** (recursively parse inner content)
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/)
    if (boldMatch) {
      parts.push(<strong key={key++}>{parseMarkdown(boldMatch[1])}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Strikethrough: ~~text~~ (recursively parse inner content)
    const strikeMatch = remaining.match(/^~~(.+?)~~/)
    if (strikeMatch) {
      parts.push(<s key={key++}>{parseMarkdown(strikeMatch[1])}</s>)
      remaining = remaining.slice(strikeMatch[0].length)
      continue
    }

    // Underline: ++text++ or __text__ (recursively parse inner content)
    const underlineMatch = remaining.match(/^(?:\+\+(.+?)\+\+|__(.+?)__)/)
    if (underlineMatch) {
      const content = underlineMatch[1] || underlineMatch[2]
      parts.push(<u key={key++}>{parseMarkdown(content)}</u>)
      remaining = remaining.slice(underlineMatch[0].length)
      continue
    }

    // Italic: *text* or _text_ (recursively parse inner content)
    const italicStarMatch = remaining.match(/^\*(.+?)\*/)
    if (italicStarMatch) {
      parts.push(<em key={key++}>{parseMarkdown(italicStarMatch[1])}</em>)
      remaining = remaining.slice(italicStarMatch[0].length)
      continue
    }

    const italicUnderMatch = remaining.match(/^_(.+?)_/)
    if (italicUnderMatch) {
      parts.push(<em key={key++}>{parseMarkdown(italicUnderMatch[1])}</em>)
      remaining = remaining.slice(italicUnderMatch[0].length)
      continue
    }

    // Code: `text` (no recursive parsing - code is literal)
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      parts.push(
        <code
          key={key++}
          className="bg-muted rounded px-1 py-0.5 font-mono text-sm"
        >
          {codeMatch[1]}
        </code>,
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Link: [text](url) (recursively parse link text)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      parts.push(
        <a
          key={key++}
          href={linkMatch[2]}
          className="text-primary hover:text-primary/80 underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          {parseMarkdown(linkMatch[1])}
        </a>,
      )
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Plain text until next special character
    const plainMatch = remaining.match(/^[^*_`\[~+]+/)
    if (plainMatch) {
      parts.push(plainMatch[0])
      remaining = remaining.slice(plainMatch[0].length)
      continue
    }

    // If no match, consume one character
    parts.push(remaining[0])
    remaining = remaining.slice(1)
  }

  return parts
}

function interpolatePlaceholders(
  text: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return text

  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] !== undefined ? String(values[key]) : match
  })
}
