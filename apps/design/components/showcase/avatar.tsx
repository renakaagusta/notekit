import type { CSSProperties } from 'react';
import { Preview } from '@/components/showcase/preview';

function Avatar({
  initial,
  size = 32,
  tone = 'solid',
}: {
  initial: string;
  size?: number;
  tone?: 'solid' | 'muted';
}) {
  const palette: CSSProperties =
    tone === 'solid'
      ? { background: 'var(--color-fd-primary)', color: 'var(--color-fd-primary-foreground)' }
      : { background: 'var(--color-fd-muted)', color: 'var(--color-fd-muted-foreground)' };
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        ...palette,
      }}
    >
      {initial}
    </span>
  );
}

export function AvatarShowcase() {
  return (
    <Preview>
      <Avatar initial="R" size={24} />
      <Avatar initial="R" size={32} />
      <Avatar initial="A" size={40} tone="muted" />
      <span style={{ display: 'inline-flex', paddingLeft: 8 }}>
        {['R', 'A', 'M'].map((initial, index) => (
          <span key={initial} style={{ marginLeft: index === 0 ? 0 : -8 }}>
            <span
              style={{
                display: 'inline-block',
                borderRadius: 9999,
                boxShadow: '0 0 0 2px var(--color-fd-card)',
              }}
            >
              <Avatar initial={initial} size={28} tone={index % 2 ? 'muted' : 'solid'} />
            </span>
          </span>
        ))}
      </span>
    </Preview>
  );
}
