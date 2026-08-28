'use client';

import {
  FileText,
  Search,
  CheckSquare,
  SunMoon,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Preview } from '@/components/showcase/preview';

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string[];
}

const COMMANDS: Command[] = [
  { id: 'new-note', label: 'New note', icon: FileText, shortcut: ['⌘', 'N'] },
  { id: 'search-notes', label: 'Search notes', icon: Search, shortcut: ['⌘', 'F'] },
  { id: 'go-to-tasks', label: 'Go to Tasks', icon: CheckSquare, shortcut: ['⌘', 'T'] },
  { id: 'toggle-theme', label: 'Toggle theme', icon: SunMoon },
  { id: 'new-vault', label: 'New vault', icon: Database },
];

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const panelStyle: React.CSSProperties = {
  width: 'min(480px, 100%)',
  background: 'var(--color-fd-popover)',
  color: 'var(--color-fd-foreground)',
  border: '1px solid var(--color-fd-border)',
  borderRadius: 10,
  boxShadow: '0px 7px 32px rgba(0,0,0,0.35)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-fd-border)',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 13,
  color: 'var(--color-fd-foreground)',
  fontFamily: 'inherit',
};

const listStyle: React.CSSProperties = {
  padding: '6px',
  overflowY: 'auto',
  maxHeight: 320,
};

function CommandRow({ command, onSelect }: { command: Command; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const Icon = command.icon;

  return (
    <div
      role="option"
      aria-selected={false}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        borderRadius: 6,
        fontSize: 13,
        cursor: 'pointer',
        background: hovered ? 'var(--color-fd-accent)' : 'transparent',
        color: hovered
          ? 'var(--color-fd-accent-foreground)'
          : 'var(--color-fd-foreground)',
        transition: 'background 80ms',
      }}
    >
      <Icon size={15} style={{ opacity: 0.7, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{command.label}</span>
      {command.shortcut ? <ShortcutHint keys={command.shortcut} /> : null}
    </div>
  );
}

function ShortcutHint({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {keys.map((key) => (
        <span
          key={key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 18,
            minWidth: 18,
            padding: '0 4px',
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'inherit',
            background: 'var(--color-fd-muted)',
            color: 'var(--color-fd-muted-foreground)',
            border: '1px solid var(--color-fd-border)',
          }}
        >
          {key}
        </span>
      ))}
    </span>
  );
}

function CommandPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filtered = COMMANDS.filter((command) =>
    command.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div style={panelStyle} onClick={(event) => event.stopPropagation()}>
      <div style={searchWrapStyle}>
        <Search size={14} style={{ color: 'var(--color-fd-muted-foreground)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          style={searchInputStyle}
          placeholder="Search commands…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div role="listbox" style={listStyle}>
        {filtered.length > 0 ? (
          filtered.map((command) => (
            <CommandRow key={command.id} command={command} onSelect={onClose} />
          ))
        ) : (
          <div
            style={{
              padding: '14px 10px',
              fontSize: 13,
              color: 'var(--color-fd-muted-foreground)',
              textAlign: 'center',
            }}
          >
            No commands match
          </div>
        )}
      </div>
    </div>
  );
}

const triggerButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--color-fd-border)',
  background: 'var(--color-fd-background)',
  color: 'var(--color-fd-foreground)',
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

export function CommandMenuShowcase() {
  const [open, setOpen] = useState(false);

  return (
    <Preview>
      <button type="button" style={triggerButtonStyle} onClick={() => setOpen(true)}>
        Open command menu
        <span style={{ display: 'inline-flex', gap: 3 }}>
          <ShortcutHint keys={['⌘', 'K']} />
        </span>
      </button>

      {open ? (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <CommandPanel onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </Preview>
  );
}
