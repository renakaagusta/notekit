'use client';

import { Copy, MoreHorizontal, PencilLine, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PhoneFrame } from '@/components/showcase/phone-frame';
import { Preview } from '@/components/showcase/preview';

const ITEMS = [
  { icon: PencilLine, label: 'Rename', danger: false },
  { icon: Copy, label: 'Duplicate', danger: false },
  { icon: Trash2, label: 'Delete', danger: true },
];

const trigger: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 6,
  border: '1px solid var(--color-fd-border)',
  background: 'var(--color-fd-background)',
  color: 'var(--color-fd-foreground)',
  cursor: 'pointer',
};

const row = (danger: boolean, big = false): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: big ? '12px 10px' : '7px 10px',
  fontSize: big ? 14 : 13,
  borderRadius: 5,
  cursor: 'pointer',
  color: danger ? '#e5484d' : 'var(--color-fd-foreground)',
});

export function MenuShowcase() {
  const [open, setOpen] = useState(false);
  return (
    <Preview>
      <div style={{ position: 'relative' }}>
        <button type="button" style={trigger} onClick={() => setOpen((current) => !current)}>
          <MoreHorizontal size={16} />
        </button>
        {open ? (
          <div
            style={{
              position: 'absolute',
              top: 34,
              left: 0,
              minWidth: 168,
              padding: 4,
              background: 'var(--color-fd-popover)',
              border: '1px solid var(--color-fd-border)',
              borderRadius: 8,
              boxShadow: '0px 4px 24px rgba(0,0,0,0.2)',
              zIndex: 20,
            }}
          >
            {ITEMS.map(({ icon: Icon, label, danger }) => (
              <div key={label} style={row(danger)} onClick={() => setOpen(false)}>
                <Icon size={15} strokeWidth={1.9} />
                {label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Preview>
  );
}

export function MenuSheetShowcase() {
  const [open, setOpen] = useState(true);
  return (
    <Preview>
      <PhoneFrame label="Action sheet · mobile">
        <div style={{ padding: '32px 16px 16px' }}>
          <div style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Weekly review
          </div>
          <button
            type="button"
            style={{ ...trigger, width: 'auto', padding: '0 10px', gap: 6 }}
            onClick={() => setOpen(true)}
          >
            <MoreHorizontal size={16} /> Actions
          </button>
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
                borderRadius: '16px 16px 0 0',
                padding: '10px 12px 16px',
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
                  margin: '0 auto 10px',
                }}
              />
              {ITEMS.map(({ icon: Icon, label, danger }) => (
                <div key={label} style={row(danger, true)} onClick={() => setOpen(false)}>
                  <Icon size={17} strokeWidth={1.9} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </PhoneFrame>
    </Preview>
  );
}
