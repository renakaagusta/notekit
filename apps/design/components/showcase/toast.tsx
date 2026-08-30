'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/showcase/button';
import { Preview } from '@/components/showcase/preview';

export function ToastShowcase() {
  const [visible, setVisible] = useState(false);

  const fire = () => {
    setVisible(true);
    window.setTimeout(() => setVisible(false), 2400);
  };

  return (
    <Preview>
      <span onClick={fire} style={{ display: 'inline-flex' }}>
        <Button variant="secondary">Save note</Button>
      </span>

      <div
        aria-live="polite"
        style={{
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {visible ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              borderRadius: 8,
              fontSize: 13,
              background: 'var(--color-fd-primary)',
              color: 'var(--color-fd-primary-foreground)',
              boxShadow: '0px 4px 24px rgba(0,0,0,0.2)',
            }}
          >
            <Check size={15} strokeWidth={2.5} />
            Note saved and synced
          </span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-fd-muted-foreground)' }}>
            Trigger a toast →
          </span>
        )}
      </div>
    </Preview>
  );
}
