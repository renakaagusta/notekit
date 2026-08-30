import { FileText, Inbox, KeyRound, Link2, ListTodo, RefreshCw, Settings } from 'lucide-react';
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
        width: '100%',
      }}
    >
      Personal vault
      <RefreshCw size={13} style={{ opacity: 0.6 }} />
    </button>
  );
}

function SurfaceList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {SURFACES.map(({ icon: Icon, label, active }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--color-fd-foreground)',
            background: active ? 'var(--color-fd-accent)' : 'transparent',
            cursor: 'pointer',
          }}
        >
          <Icon size={16} strokeWidth={1.75} />
          {label}
        </div>
      ))}
    </div>
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
          flexShrink: 0,
        }}
      >
        R
      </span>
      <span style={{ fontSize: 13 }}>rena</span>
    </div>
  );
}

export function SidebarShowcase() {
  return (
    <Preview>
      <div
        style={{
          width: 240,
          height: 420,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--color-fd-border)',
          borderRadius: 10,
          background: 'var(--color-fd-popover)',
          padding: '14px 12px 0',
          overflow: 'hidden',
        }}
      >
        <VaultButton />
        <SurfaceList />
        <AccountFooter />
      </div>
    </Preview>
  );
}
