'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { Preview } from '@/components/showcase/preview';

export function Checkbox({ defaultChecked = false, label }: { defaultChecked?: boolean; label: string }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <button
      type="button"
      onClick={() => setChecked((value) => !value)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--color-fd-foreground)',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--color-fd-border)',
          background: checked ? 'var(--color-fd-primary)' : 'transparent',
          color: 'var(--color-fd-primary-foreground)',
        }}
      >
        {checked ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      {label}
    </button>
  );
}

export function Switch({ defaultOn = false, label }: { defaultOn?: boolean; label: string }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      onClick={() => setOn((value) => !value)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--color-fd-foreground)',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: 32,
          height: 18,
          borderRadius: 9999,
          padding: 2,
          display: 'inline-flex',
          justifyContent: on ? 'flex-end' : 'flex-start',
          background: on ? 'var(--color-fd-primary)' : 'var(--color-fd-muted)',
          transition: 'background 150ms',
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 9999,
            background: on ? 'var(--color-fd-primary-foreground)' : 'var(--color-fd-background)',
          }}
        />
      </span>
      {label}
    </button>
  );
}

export function CheckboxShowcase() {
  return (
    <Preview>
      <Checkbox label="Encrypt this vault" defaultChecked />
      <Checkbox label="Sync on save" />
    </Preview>
  );
}

export function SwitchShowcase() {
  return (
    <Preview>
      <Switch label="Offline mode" defaultOn />
      <Switch label="Show word count" />
    </Preview>
  );
}
