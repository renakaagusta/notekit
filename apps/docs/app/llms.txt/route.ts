import { llms } from 'fumadocs-core/source';
import { source } from '@/lib/source';

// llms.txt — a compact index of every doc page (title, URL, description) so an
// agent can discover the docs and fetch the pages it needs.
export const revalidate = false;

export function GET() {
  return new Response(llms(source).index(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
