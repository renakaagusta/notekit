'use client';

import { useState } from 'react';
import { neutralScale, byGroup, leaf, type DesignToken } from '@/lib/tokens';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied((current) => (current === value ? null : current)), 1200);
  };
  return { copied, copy };
}

// A step number reads legibly on its own cell: dark ink on steps 1–8, light on 9–12.
function inkFor(step: number, mode: 'dark' | 'light'): string {
  if (mode === 'dark') return step >= 9 ? '#0a0a0b' : '#e4e4e7';
  return step >= 9 ? '#ffffff' : '#18181b';
}

export function NeutralScale({ mode }: { mode: 'dark' | 'light' }) {
  const steps = neutralScale(mode);
  const { copied, copy } = useCopy();

  return (
    <div
      style={{
        border: '1px solid var(--color-fd-border)',
        borderRadius: 10,
        overflow: 'hidden',
        margin: '1rem 0 1.5rem',
      }}
    >
      <div style={{ display: 'flex' }}>
        {steps.map((token) => {
          const step = Number(token.path[4]);
          const isCopied = copied === token.value;
          return (
            <button
              key={token.name}
              type="button"
              onClick={() => copy(token.value)}
              title={`${token.value} — ${token.description}`}
              style={{
                flex: 1,
                height: 88,
                background: token.value,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingBottom: 8,
                color: inkFor(step, mode),
                fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isCopied ? 'copied' : step}
            </button>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 11,
          color: 'var(--color-fd-muted-foreground)',
          borderTop: '1px solid var(--color-fd-border)',
        }}
      >
        {steps.map((token) => (
          <code
            key={token.name}
            style={{ flex: 1, textAlign: 'center', padding: '6px 2px', overflow: 'hidden' }}
          >
            {token.value}
          </code>
        ))}
      </div>
    </div>
  );
}

export function SwatchRow({ group }: { group: string }) {
  const swatches = byGroup('color', group);
  const { copied, copy } = useCopy();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10,
        margin: '1rem 0 1.5rem',
      }}
    >
      {swatches.map((token) => {
        const isCopied = copied === token.value;
        return (
          <button
            key={token.name}
            type="button"
            onClick={() => copy(token.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              border: '1px solid var(--color-fd-border)',
              borderRadius: 8,
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                flexShrink: 0,
                background: token.value,
                boxShadow: 'inset 0 0 0 1px rgba(128,128,128,0.25)',
              }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{leaf(token)}</span>
              <code style={{ fontSize: 11, opacity: 0.7 }}>
                {isCopied ? 'copied' : token.value}
              </code>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type { DesignToken };
