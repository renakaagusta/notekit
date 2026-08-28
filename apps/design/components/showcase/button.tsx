import { Plus, Trash2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Preview } from '@/components/showcase/preview';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 590,
  cursor: 'pointer',
  border: '1px solid transparent',
  fontFamily: 'inherit',
};

const variants: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--color-fd-primary)',
    color: 'var(--color-fd-primary-foreground)',
  },
  secondary: {
    background: 'var(--color-fd-secondary)',
    color: 'var(--color-fd-secondary-foreground)',
    borderColor: 'var(--color-fd-border)',
  },
  ghost: { background: 'transparent', color: 'var(--color-fd-foreground)' },
  destructive: { background: '#e5484d', color: '#ffffff' },
};

export function Button({
  variant = 'primary',
  children,
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return <button style={{ ...base, ...variants[variant] }}>{children}</button>;
}

export function ButtonShowcase() {
  return (
    <Preview>
      <Button variant="primary">
        <Plus size={14} strokeWidth={2} /> Primary
      </Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">
        <Trash2 size={14} strokeWidth={2} /> Delete
      </Button>
    </Preview>
  );
}
