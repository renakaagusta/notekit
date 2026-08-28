import { Search } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Preview } from '@/components/showcase/preview';

const field: CSSProperties = {
  height: 32,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--color-fd-border)',
  background: 'var(--color-fd-background)',
  color: 'var(--color-fd-foreground)',
  fontSize: 13,
  fontFamily: 'inherit',
  minWidth: 200,
};

export function TextField({
  placeholder,
  defaultValue,
  disabled,
}: {
  placeholder?: string;
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <input
      style={{ ...field, opacity: disabled ? 0.5 : 1 }}
      placeholder={placeholder}
      defaultValue={defaultValue}
      disabled={disabled}
    />
  );
}

export function InputShowcase() {
  return (
    <Preview>
      <TextField placeholder="Note title…" />
      <TextField defaultValue="Filled value" />
      <TextField placeholder="Disabled" disabled />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          ...field,
          minWidth: 220,
        }}
      >
        <Search size={14} style={{ opacity: 0.6 }} />
        <input
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: 13,
            fontFamily: 'inherit',
            width: '100%',
          }}
          placeholder="Search notes…"
        />
      </span>
    </Preview>
  );
}
