import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

export const { docs, meta } = defineDocs({
  dir: 'content/pages',
  // Keep the processed Markdown around so the llms.txt routes can serve each
  // page as clean text (page.data.getText('processed')).
  docs: {
    postprocess: { includeProcessedMarkdown: true },
  },
});

export default defineConfig();
