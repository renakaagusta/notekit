'use client';

import { ChevronRight, Menu, MoreHorizontal, Plus, Search, Share2 } from 'lucide-react';
import { useState } from 'react';
import { DrawerPanel } from '@/components/showcase/drawer';
import { PhoneFrame } from '@/components/showcase/phone-frame';
import { Preview } from '@/components/showcase/preview';

const iconButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--color-fd-foreground)',
  cursor: 'pointer',
};

export function AppBarShowcase() {
  return (
    <Preview>
      <div
        style={{
          width: '100%',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderRadius: 8,
          border: '1px solid var(--color-fd-border)',
          background: 'var(--color-fd-background)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            color: 'var(--color-fd-muted-foreground)',
          }}
        >
          Personal
          <ChevronRight size={13} style={{ opacity: 0.5 }} />
          <span style={{ color: 'var(--color-fd-foreground)', fontWeight: 590 }}>
            Weekly review
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" style={iconButton}>
            <Search size={16} />
          </button>
          <button type="button" style={iconButton}>
            <Share2 size={16} />
          </button>
          <button type="button" style={iconButton}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    </Preview>
  );
}

export function AppBarMobileShowcase() {
  const [open, setOpen] = useState(false);
  return (
    <Preview>
      <PhoneFrame label="App bar · mobile">
        <div
          style={{
            height: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 8px 0',
            borderBottom: '1px solid var(--color-fd-border)',
          }}
        >
          <button type="button" style={iconButton} onClick={() => setOpen(true)}>
            <Menu size={18} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Notes</span>
          <button type="button" style={iconButton}>
            <Plus size={18} />
          </button>
        </div>
        <div style={{ padding: 16, fontSize: 13, color: 'var(--color-fd-muted-foreground)' }}>
          Tap the menu icon to open the drawer.
        </div>
        <DrawerPanel open={open} onClose={() => setOpen(false)} />
      </PhoneFrame>
    </Preview>
  );
}
