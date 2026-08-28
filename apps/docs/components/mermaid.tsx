'use client';

import { useTheme } from 'next-themes';
import { useEffect, useId, useState } from 'react';

// Client-rendered Mermaid diagrams. mermaid is heavy and browser-only, so it is
// dynamically imported on mount and re-rendered when the Fumadocs theme flips.
// securityLevel 'strict' sanitizes the generated SVG; diagram source is authored
// in-repo (trusted), never user input.
export function Mermaid({ chart }: { chart: string }) {
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        theme: resolvedTheme === 'dark' ? 'dark' : 'neutral',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      const { svg: rendered } = await mermaid.render(id, chart.trim());
      if (!cancelled) setSvg(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  return (
    <div
      role="img"
      style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0', overflowX: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
