export function stripMarkdownTitle(title: string): string {
  return title
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#+\s*/, '')
    .replace(/`(.*?)`/g, '$1')
    .trim()
}
