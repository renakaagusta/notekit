import * as React from 'react'

import { cn } from '../utils/cn'

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

interface MatchResult { matched: string; content: React.ReactNode }
type Matcher = (text: string, key: number) => MatchResult | null

function tryBoldItalic(text: string, key: number): MatchResult | null {
  const match = text.match(/^\*\*\*(.+?)\*\*\*/)
  if (!match) return null
  return {
    matched: match[0],
    content: (
      <strong key={key}>
        <em>{parseMarkdown(match[1])}</em>
      </strong>
    ),
  }
}

function tryBold(text: string, key: number): MatchResult | null {
  const match = text.match(/^\*\*(.+?)\*\*/)
  if (!match) return null
  return { matched: match[0], content: <strong key={key}>{parseMarkdown(match[1])}</strong> }
}

function tryStrike(text: string, key: number): MatchResult | null {
  const match = text.match(/^~~(.+?)~~/)
  if (!match) return null
  return { matched: match[0], content: <s key={key}>{parseMarkdown(match[1])}</s> }
}

function tryUnderline(text: string, key: number): MatchResult | null {
  const match = text.match(/^(?:\+\+(.+?)\+\+|__(.+?)__)/)
  if (!match) return null
  const inner = match[1] || match[2]
  return { matched: match[0], content: <u key={key}>{parseMarkdown(inner)}</u> }
}

function tryItalicStar(text: string, key: number): MatchResult | null {
  const match = text.match(/^\*(.+?)\*/)
  if (!match) return null
  return { matched: match[0], content: <em key={key}>{parseMarkdown(match[1])}</em> }
}

function tryItalicUnder(text: string, key: number): MatchResult | null {
  const match = text.match(/^_(.+?)_/)
  if (!match) return null
  return { matched: match[0], content: <em key={key}>{parseMarkdown(match[1])}</em> }
}

function tryCode(text: string, key: number): MatchResult | null {
  const match = text.match(/^`([^`]+)`/)
  if (!match) return null
  return {
    matched: match[0],
    content: (
      <code key={key} className="bg-muted rounded px-1 py-0.5 font-mono text-sm">
        {match[1]}
      </code>
    ),
  }
}

function tryLink(text: string, key: number): MatchResult | null {
  const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)/)
  if (!match) return null
  return {
    matched: match[0],
    content: (
      <a
        key={key}
        href={match[2]}
        className="text-primary hover:text-primary/80 underline underline-offset-4"
        target="_blank"
        rel="noopener noreferrer"
      >
        {parseMarkdown(match[1])}
      </a>
    ),
  }
}

function tryPlain(text: string, _key: number): MatchResult | null {
  const match = text.match(/^[^*_`[~+]+/)
  if (!match) return null
  return { matched: match[0], content: match[0] }
}

const MATCHERS: Matcher[] = [
  tryBoldItalic,
  tryBold,
  tryStrike,
  tryUnderline,
  tryItalicStar,
  tryItalicUnder,
  tryCode,
  tryLink,
  tryPlain,
]

function parseMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    let advanced = false
    for (const matcher of MATCHERS) {
      const result = matcher(remaining, key)
      if (result) {
        parts.push(result.content)
        remaining = remaining.slice(result.matched.length)
        key++
        advanced = true
        break
      }
    }
    if (!advanced) {
      parts.push(remaining[0])
      remaining = remaining.slice(1)
    }
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
