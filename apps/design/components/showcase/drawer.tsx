'use client';

import { FileText, Inbox, KeyRound, Link2, ListTodo, RefreshCw, Settings } from 'lucide-react';
import { useState } from 'react';
import { PhoneFrame } from '@/components/showcase/phone-frame';
import { Preview } from '@/components/showcase/preview';

const SURFACES = [
  { icon: FileText, label: 'Notes', active: true },
  { icon: ListTodo, label: 'Tasks', active: false },
  { icon: Link2, label: 'Links', active: false },
  { icon: KeyRound, label: 'Secrets', active: false },
  { icon: Inbox, label: 'Inbox', active: false },
  { icon: Settings, label: 'Settings', active: false },
];

function VaultButton() {
  return (
    <button
      type="button"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        marginBottom: 8,
        borderRadius: 8,
        border: '1px solid var(--color-fd-border)',
        background: 'var(--color-fd-background)',
        color: 'var(--color-fd-foreground)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Personal vault
      <RefreshCw size={13} style={{ opacity: 0.6 }} />
    </button>
  );
}

function AccountFooter() {
  return (
    <div
      style={{
        marginTop: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderTop: '1px solid var(--color-fd-border)',
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 9999,
          background: 'var(--color-fd-primary)',
          color: 'var(--color-fd-primary-foreground)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        R
      </span>
      <span style={{ fontSize: 13 }}>rena</span>
    </div>
  );
}

export function DrawerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '78%',
          background: 'var(--color-fd-popover)',
          borderRight: '1px solid var(--color-fd-border)',
          padding: '38px 12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <VaultButton />
        {SURFACES.map(({ icon: Icon, label, active }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 10px',
              borderRadius: 8,
              fontSize: 14,
              color: 'var(--color-fd-foreground)',
              background: active ? 'var(--color-fd-accent)' : 'transparent',
            }}
          >
            <Icon size={17} strokeWidth={1.75} />
            {label}
          </div>
        ))}
        <AccountFooter />
      </div>
    </div>
  );
}

export function NavDrawerShowcase() {
  const [open, setOpen] = useState(true);
  return (
    <Preview>
      <PhoneFrame label="Navigation drawer · mobile">
        <div style={{ padding: '32px 16px 16px' }}>
          <div style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>Notes</div>
          <p style={{ fontSize: 13, color: 'var(--color-fd-muted-foreground)', marginTop: 10 }}>
            Tap the scrim to close the drawer.
          </p>
        </div>
        <DrawerPanel open={open} onClose={() => setOpen(false)} />
      </PhoneFrame>
    </Preview>
  );
}
