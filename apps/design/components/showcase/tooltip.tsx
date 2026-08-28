'use client';

import { Info, Lock } from 'lucide-react';
import { useState } from 'react';
import { Preview } from '@/components/showcase/preview';

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show ? (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 12,
            background: 'var(--color-fd-primary)',
            color: 'var(--color-fd-primary-foreground)',
            boxShadow: '0px 4px 24px rgba(0,0,0,0.2)',
            zIndex: 20,
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

const iconButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 6,
  border: '1px solid var(--color-fd-border)',
  background: 'var(--color-fd-background)',
  color: 'var(--color-fd-foreground)',
  cursor: 'pointer',
};

export function TooltipShowcase() {
  return (
    <Preview>
      <Tip label="End-to-end encrypted">
        <button type="button" style={iconButton}>
          <Lock size={16} />
        </button>
      </Tip>
      <Tip label="Synced 2 minutes ago">
        <button type="button" style={iconButton}>
          <Info size={16} />
        </button>
      </Tip>
      <span style={{ fontSize: 13, color: 'var(--color-fd-muted-foreground)' }}>
        Hover or focus the buttons.
      </span>
    </Preview>
  );
}
