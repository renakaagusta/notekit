import type { ReactNode } from 'react';

export function Preview({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 14,
        padding: 32,
        margin: '1.5rem 0',
        border: '1px solid var(--color-fd-border)',
        borderRadius: 10,
        background: 'var(--color-fd-card)',
      }}
    >
      {children}
    </div>
  );
}
