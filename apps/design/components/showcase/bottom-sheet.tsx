'use client';

import { useState } from 'react';
import { Button } from '@/components/showcase/button';
import { PhoneFrame } from '@/components/showcase/phone-frame';
import { Preview } from '@/components/showcase/preview';

export function BottomSheetShowcase() {
  const [open, setOpen] = useState(true);
  return (
    <Preview>
      <PhoneFrame label="Bottom sheet · mobile">
        <div style={{ padding: '32px 16px 16px', height: '100%' }}>
          <div style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12 }}>Vault</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span onClick={() => setOpen(true)} style={{ display: 'inline-flex' }}>
              <Button variant="secondary">Delete vault…</Button>
            </span>
          </div>
        </div>

        {open ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
            <div
              onClick={() => setOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                background: 'var(--color-fd-popover)',
                color: 'var(--color-fd-popover-foreground)',
                borderTop: '1px solid var(--color-fd-border)',
                borderRadius: '16px 16px 0 0',
                padding: '10px 18px 20px',
                boxShadow: '0px -7px 32px rgba(0,0,0,0.28)',
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 9999,
                  background: 'var(--color-fd-border)',
                  margin: '0 auto 14px',
                }}
              />
              <strong style={{ fontSize: 15 }}>Delete this vault?</strong>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--color-fd-muted-foreground)',
                  margin: '8px 0 16px',
                }}
              >
                This removes the vault and its keys from this device.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <span onClick={() => setOpen(false)} style={{ display: 'flex', flex: 1 }}>
                  <Button variant="secondary" block>
                    Cancel
                  </Button>
                </span>
                <span onClick={() => setOpen(false)} style={{ display: 'flex', flex: 1 }}>
                  <Button variant="destructive" block>
                    Delete
                  </Button>
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </PhoneFrame>
    </Preview>
  );
}
