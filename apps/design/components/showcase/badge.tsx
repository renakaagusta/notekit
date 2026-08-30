import type { CSSProperties, ReactNode } from 'react';
import { Preview } from '@/components/showcase/preview';

type Tone = 'neutral' | 'solid' | 'success' | 'destructive' | 'outline';

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 8px',
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 590,
  border: '1px solid transparent',
};

const tones: Record<Tone, CSSProperties> = {
  neutral: { background: 'var(--color-fd-muted)', color: 'var(--color-fd-muted-foreground)' },
  solid: { background: 'var(--color-fd-primary)', color: 'var(--color-fd-primary-foreground)' },
  success: { background: 'rgba(34,197,94,0.15)', color: '#16a34a' },
  destructive: { background: 'rgba(229,72,77,0.15)', color: '#e5484d' },
  outline: {
    background: 'transparent',
    color: 'var(--color-fd-foreground)',
    borderColor: 'var(--color-fd-border)',
  },
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span style={{ ...base, ...tones[tone] }}>{children}</span>;
}

export function BadgeShowcase() {
  return (
    <Preview>
      <Badge tone="neutral">Draft</Badge>
      <Badge tone="solid">Active</Badge>
      <Badge tone="success">Synced</Badge>
      <Badge tone="destructive">Conflict</Badge>
      <Badge tone="outline">Encrypted</Badge>
    </Preview>
  );
}
