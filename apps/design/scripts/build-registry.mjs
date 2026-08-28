import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// Generate a real shadcn registry from @notekit/tokens so the theme is installable
// via `npx shadcn add` and machine-readable for agents. Runs before next build.
const require = createRequire(import.meta.url);
const { tokens } = require('@notekit/tokens/tokens.json');

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'r');

const semanticVarsFor = (mode) =>
  Object.fromEntries(
    tokens
      .filter((token) => token.path[0] === 'color' && token.path[1] === mode)
      .map((token) => [`nk-${token.path.slice(2).join('-')}`, token.value]),
  );

const scaleVarsFor = (mode) =>
  Object.fromEntries(
    tokens
      .filter(
        (token) =>
          token.path[0] === 'color' && token.path[1] === 'scale' && token.path[3] === mode,
      )
      .map((token) => [`nk-neutral-${token.path[4]}`, token.value]),
  );

const themeItem = {
  $schema: 'https://ui.shadcn.com/schema/registry-item.json',
  name: 'notekit-theme',
  type: 'registry:theme',
  title: 'NoteKit theme',
  description: "NoteKit's monochrome design tokens (neutral scale + semantic) as CSS variables.",
  cssVars: {
    light: { ...scaleVarsFor('light'), ...semanticVarsFor('light') },
    dark: { ...scaleVarsFor('dark'), ...semanticVarsFor('dark') },
  },
};

const registry = {
  $schema: 'https://ui.shadcn.com/schema/registry.json',
  name: 'notekit',
  homepage: 'https://design.notekit.online',
  items: [
    {
      name: 'notekit-theme',
      type: 'registry:theme',
      title: 'NoteKit theme',
      description: themeItem.description,
    },
  ],
};

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'notekit-theme.json'), JSON.stringify(themeItem, null, 2) + '\n');
await writeFile(join(outDir, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
console.log(`registry: wrote ${registry.items.length} item(s) to public/r/`);
