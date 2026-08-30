import { ArrowUpRight, Check, FileText, Search, Star, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { NoteKitMark } from '@/components/brand';
import { neutralScale } from '@/lib/tokens';

interface Foundation {
  title: string;
  href: string;
  description: string;
  preview: ReactNode;
}

const previewBox: React.CSSProperties = {
  height: 108,
  borderRadius: 8,
  background: 'var(--color-fd-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  marginBottom: 14,
};

function ColorPreview() {
  const steps = neutralScale('dark').filter((_, index) => index % 2 === 0);
  return (
    <div style={{ display: 'flex', width: '80%', height: 40, borderRadius: 6, overflow: 'hidden' }}>
      {steps.map((token) => (
        <div key={token.name} style={{ flex: 1, background: token.value }} />
      ))}
    </div>
  );
}

const FOUNDATIONS: Foundation[] = [
  {
    title: 'Brand',
    href: '/foundations/brand',
    description: 'The NoteKit mark and wordmark, and how to use them.',
    preview: <NoteKitMark size={44} />,
  },
  {
    title: 'Colors',
    href: '/foundations/color',
    description: 'A monochrome, high-contrast neutral scale with semantic accents.',
    preview: <ColorPreview />,
  },
  {
    title: 'Typography',
    href: '/foundations/typography',
    description: 'Inter for the product, JetBrains Mono for code, and the size scale.',
    preview: (
      <span style={{ fontSize: 52, fontWeight: 680, letterSpacing: '-0.03em' }}>Ag</span>
    ),
  },
  {
    title: 'Spacing',
    href: '/foundations/spacing',
    description: 'The spacing scale for gaps, padding, and layout rhythm.',
    preview: (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {[10, 16, 24, 34, 46].map((height) => (
          <div
            key={height}
            style={{ width: 10, height, background: 'var(--color-fd-primary)', borderRadius: 2 }}
          />
        ))}
      </div>
    ),
  },
  {
    title: 'Radius',
    href: '/foundations/radius',
    description: 'The corner-radius scale and its semantic aliases.',
    preview: (
      <div style={{ display: 'flex', gap: 10 }}>
        {[4, 10, 18].map((radius) => (
          <div
            key={radius}
            style={{
              width: 42,
              height: 42,
              borderTopLeftRadius: radius,
              border: '2px solid var(--color-fd-primary)',
              borderRadius: `${radius}px 0 0 0`,
            }}
          />
        ))}
      </div>
    ),
  },
  {
    title: 'Elevation',
    href: '/foundations/elevation',
    description: 'The shadow scale for lifting surfaces off the page.',
    preview: (
      <div
        style={{
          width: 96,
          height: 52,
          borderRadius: 8,
          background: 'var(--color-fd-card)',
          boxShadow: '0px 7px 32px rgba(0,0,0,0.35)',
        }}
      />
    ),
  },
  {
    title: 'Motion',
    href: '/foundations/motion',
    description: 'Durations and easing curves for transitions.',
    preview: (
      <svg width="120" height="60" viewBox="0 0 120 60" fill="none" aria-hidden>
        <path
          d="M4 56 C 40 56, 44 4, 116 4"
          stroke="var(--color-fd-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: 'Icons',
    href: '/foundations/icons',
    description: 'lucide-react — never emoji.',
    preview: (
      <div style={{ display: 'flex', gap: 14, color: 'var(--color-fd-foreground)' }}>
        <FileText size={22} strokeWidth={1.75} />
        <Search size={22} strokeWidth={1.75} />
        <Star size={22} strokeWidth={1.75} />
        <Check size={22} strokeWidth={1.75} />
        <Trash2 size={22} strokeWidth={1.75} />
      </div>
    ),
  },
];

export function FoundationGrid() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
        margin: '1.5rem 0',
      }}
    >
      {FOUNDATIONS.map((foundation) => (
        <a
          key={foundation.href}
          href={foundation.href}
          style={{
            display: 'block',
            padding: 14,
            border: '1px solid var(--color-fd-border)',
            borderRadius: 12,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={previewBox}>{foundation.preview}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            {foundation.title}
            <ArrowUpRight size={14} style={{ opacity: 0.5 }} />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-fd-muted-foreground)' }}>
            {foundation.description}
          </p>
        </a>
      ))}
    </div>
  );
}
