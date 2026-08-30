import { Bold, Code, CheckSquare, Heading, Italic, Link2, List } from 'lucide-react';
import type { ReactNode } from 'react';
import { PhoneFrame } from '@/components/showcase/phone-frame';
import { Preview } from '@/components/showcase/preview';

const TOOLBAR_BUTTONS = [
  { icon: Bold, label: 'Bold' },
  { icon: Italic, label: 'Italic' },
  { icon: Heading, label: 'Heading' },
  { icon: List, label: 'List' },
  { icon: CheckSquare, label: 'Checklist' },
  { icon: Link2, label: 'Link' },
  { icon: Code, label: 'Code' },
] as const;

function ToolbarButton({ icon: Icon, label }: { icon: (typeof TOOLBAR_BUTTONS)[number]['icon']; label: string }) {
  return (
    <div
      role="button"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 8,
        color: 'var(--color-fd-foreground)',
        flexShrink: 0,
      }}
    >
      <Icon size={18} strokeWidth={1.75} />
    </div>
  );
}

function EditorBody() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: '36px 16px 0',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--color-fd-foreground)',
          marginBottom: 10,
        }}
      >
        Weekly review
      </div>
      <EditorLines />
    </div>
  );
}

function EditorLines(): ReactNode {
  const lines = [
    'Shipped the MCP server update and',
    'verified agent parity across all three',
    'surfaces. Sync latency is now under 300ms',
    'on the delta-pull path.',
    '',
    'Next steps: write release notes and',
    'update the public roadmap.',
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map((line, index) => (
        <div
          key={index}
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: line === '' ? undefined : 'var(--color-fd-muted-foreground)',
            minHeight: line === '' ? 8 : undefined,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function FormattingToolbar() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--color-fd-card)',
        borderTop: '1px solid var(--color-fd-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '4px 8px 16px',
      }}
    >
      {TOOLBAR_BUTTONS.map(({ icon, label }) => (
        <ToolbarButton key={label} icon={icon} label={label} />
      ))}
    </div>
  );
}

export function EditorToolbarShowcase() {
  return (
    <Preview>
      <PhoneFrame label="Editor toolbar · mobile">
        <EditorBody />
        <FormattingToolbar />
      </PhoneFrame>
    </Preview>
  );
}
