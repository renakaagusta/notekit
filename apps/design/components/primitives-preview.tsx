import { Check, Search } from 'lucide-react';

const frame: React.CSSProperties = {
  border: '1px solid var(--color-fd-border)',
  borderRadius: 10,
  padding: 28,
  margin: '1.5rem 0',
  background: 'var(--color-fd-card)',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
};

const button: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 590,
  cursor: 'default',
  border: '1px solid transparent',
};

export function PrimitivesPreview() {
  return (
    <div style={frame}>
      <span
        style={{
          ...button,
          background: 'var(--color-fd-primary)',
          color: 'var(--color-fd-primary-foreground)',
        }}
      >
        <Check size={14} strokeWidth={2} /> Primary
      </span>
      <span
        style={{
          ...button,
          background: 'var(--color-fd-secondary)',
          color: 'var(--color-fd-secondary-foreground)',
          borderColor: 'var(--color-fd-border)',
        }}
      >
        Secondary
      </span>
      <span style={{ ...button, background: 'transparent', color: 'var(--color-fd-foreground)' }}>
        Ghost
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 22,
          padding: '0 8px',
          borderRadius: 9999,
          fontSize: 12,
          fontWeight: 590,
          background: 'var(--color-fd-muted)',
          color: 'var(--color-fd-muted-foreground)',
        }}
      >
        Badge
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          padding: '0 10px',
          borderRadius: 6,
          border: '1px solid var(--color-fd-border)',
          color: 'var(--color-fd-muted-foreground)',
          fontSize: 13,
          minWidth: 180,
        }}
      >
        <Search size={14} /> Search notes…
      </span>
    </div>
  );
}
