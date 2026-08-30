'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/showcase/button';
import { Preview } from '@/components/showcase/preview';

export function DialogShowcase() {
  const [open, setOpen] = useState(false);
  return (
    <Preview>
      <span onClick={() => setOpen(true)} style={{ display: 'inline-flex' }}>
        <Button variant="primary">Delete vault…</Button>
      </span>

      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(420px, 100%)',
              background: 'var(--color-fd-popover)',
              color: 'var(--color-fd-popover-foreground)',
              border: '1px solid var(--color-fd-border)',
              borderRadius: 10,
              boxShadow: '0px 7px 32px rgba(0,0,0,0.35)',
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <strong style={{ fontSize: 15 }}>Delete this vault?</strong>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-fd-muted-foreground)',
                }}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-fd-muted-foreground)', margin: '8px 0 20px' }}>
              This removes the vault and its keys from this device. Notes already synced stay in
              your Git remote.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span onClick={() => setOpen(false)} style={{ display: 'inline-flex' }}>
                <Button variant="secondary">Cancel</Button>
              </span>
              <span onClick={() => setOpen(false)} style={{ display: 'inline-flex' }}>
                <Button variant="destructive">Delete</Button>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </Preview>
  );
}
