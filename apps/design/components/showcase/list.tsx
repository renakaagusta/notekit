import { Bot, Cpu, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Button } from '@/components/showcase/button';
import { Preview } from '@/components/showcase/preview';

const COLOR_MUTED = 'var(--color-fd-muted)';
const COLOR_MUTED_FG = 'var(--color-fd-muted-foreground)';
const COLOR_FG = 'var(--color-fd-foreground)';
const COLOR_BORDER = 'var(--color-fd-border)';
const COLOR_CARD = 'var(--color-fd-card)';
const RADIUS_FULL = 9999;
const BADGE_SIZE = 32;

// ─── Avatar ──────────────────────────────────────────────────────────────────

function ListAvatar({ initial }: { initial: string }) {
  return (
    <span
      style={{
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        borderRadius: RADIUS_FULL,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
        background: COLOR_MUTED,
        color: COLOR_MUTED_FG,
      }}
    >
      {initial}
    </span>
  );
}

function ListIconBadge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        borderRadius: RADIUS_FULL,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: COLOR_MUTED,
        color: COLOR_MUTED_FG,
      }}
    >
      {children}
    </span>
  );
}

// ─── Trailing icon button ─────────────────────────────────────────────────────

function IconButton({ children, destructive = false }: { children: ReactNode; destructive?: boolean }) {
  return (
    <button
      type="button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        border: `1px solid ${COLOR_BORDER}`,
        background: 'transparent',
        color: destructive ? '#e5484d' : COLOR_MUTED_FG,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── Comfortable row ──────────────────────────────────────────────────────────

interface ComfortableRowProps {
  leading: ReactNode;
  title: string;
  meta: string;
  isLast?: boolean;
}

function ComfortableRow({ leading, title, meta, isLast = false }: ComfortableRowProps) {
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderBottom: isLast ? 'none' : `1px solid ${COLOR_BORDER}`,
  };

  return (
    <div style={rowStyle}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 590,
            color: COLOR_FG,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: COLOR_MUTED_FG,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {meta}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <IconButton>
          <Pencil size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton destructive>
          <Trash2 size={14} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

// ─── Compact row ─────────────────────────────────────────────────────────────

interface CompactRowProps {
  icon: ReactNode;
  title: string;
  meta: string;
  isLast?: boolean;
}

function CompactRow({ icon, title, meta, isLast = false }: CompactRowProps) {
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 14px',
    borderBottom: isLast ? 'none' : `1px solid ${COLOR_BORDER}`,
  };

  return (
    <div style={rowStyle}>
      <span style={{ color: COLOR_MUTED_FG, flexShrink: 0 }}>{icon}</span>
      <span
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 500,
          color: COLOR_FG,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 12, color: COLOR_MUTED_FG, flexShrink: 0 }}>{meta}</span>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <IconButton destructive>
          <Trash2 size={13} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

// ─── List container ───────────────────────────────────────────────────────────

function ListContainer({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 10,
        background: COLOR_CARD,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

// ─── Empty state inline ───────────────────────────────────────────────────────

function ListEmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: COLOR_MUTED,
        }}
      >
        <Bot size={28} strokeWidth={1.5} style={{ color: COLOR_MUTED_FG }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: COLOR_FG }}>No agents yet</span>
        <span style={{ fontSize: 13, color: COLOR_MUTED_FG, maxWidth: 260 }}>
          Connect an MCP agent to let it read and write your vault.
        </span>
      </div>
      <Button variant="primary">
        <Plus size={14} strokeWidth={2} /> Add agent
      </Button>
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: COLOR_MUTED_FG,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        marginBottom: 8,
        display: 'block',
      }}
    >
      {children}
    </span>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const AGENT_ROWS = [
  {
    initial: 'T',
    title: 'Triage Bot',
    meta: 'agent@example.com · added 2h ago · projects/notekit',
  },
  {
    initial: 'O',
    title: 'Oracle',
    meta: 'oracle@notekit.online · added 3d ago · global',
  },
];

const DEVICE_ROWS = [
  { icon: <Cpu size={15} strokeWidth={1.75} />, title: "Renaka's MacBook Pro", meta: 'active now' },
  { icon: <Cpu size={15} strokeWidth={1.75} />, title: 'iPhone 15 Pro', meta: '4h ago' },
  { icon: <KeyRound size={15} strokeWidth={1.75} />, title: 'sk_live_••••••••kZqT', meta: 'last used 12 Jan' },
];

// ─── Public showcases ─────────────────────────────────────────────────────────

export function ListShowcase() {
  return (
    <Preview>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32, width: '100%' }}>
        <div>
          <SectionLabel>Comfortable — agents</SectionLabel>
          <ListContainer>
            {AGENT_ROWS.map((row, index) => (
              <ComfortableRow
                key={row.title}
                leading={<ListAvatar initial={row.initial} />}
                title={row.title}
                meta={row.meta}
                isLast={index === AGENT_ROWS.length - 1}
              />
            ))}
          </ListContainer>
        </div>

        <div>
          <SectionLabel>Compact — devices &amp; tokens</SectionLabel>
          <ListContainer>
            {DEVICE_ROWS.map((row, index) => (
              <CompactRow
                key={row.title}
                icon={row.icon}
                title={row.title}
                meta={row.meta}
                isLast={index === DEVICE_ROWS.length - 1}
              />
            ))}
          </ListContainer>
        </div>
      </div>
    </Preview>
  );
}

export function ListEmptyShowcase() {
  return (
    <Preview>
      <ListContainer>
        <ListEmptyState />
      </ListContainer>
    </Preview>
  );
}

export function ListIconLeadingShowcase() {
  return (
    <Preview>
      <ListContainer>
        <ComfortableRow
          leading={
            <ListIconBadge>
              <Bot size={16} strokeWidth={1.75} />
            </ListIconBadge>
          }
          title="Triage Bot"
          meta="agent@example.com · added 2h ago"
          isLast
        />
      </ListContainer>
    </Preview>
  );
}
