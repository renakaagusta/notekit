import type { source } from '@/lib/source';

// Renders one page as plain Markdown for LLM consumption: a title + canonical URL
// header followed by the processed (MDX-expanded) body. Used by the llms.txt
// family of routes so agents can read the docs without scraping HTML.
export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title} (${page.url})

${processed}`;
}
