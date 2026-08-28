import {
  FileText,
  Folder,
  Search,
  Plus,
  Trash2,
  Share2,
  Lock,
  Check,
  Settings,
  ListTodo,
  Link2,
  KeyRound,
  RefreshCw,
  ChevronRight,
  Copy,
  Star,
} from 'lucide-react';

const ICONS = [
  ['FileText', FileText],
  ['Folder', Folder],
  ['Search', Search],
  ['Plus', Plus],
  ['Trash2', Trash2],
  ['Share2', Share2],
  ['Lock', Lock],
  ['Check', Check],
  ['Settings', Settings],
  ['ListTodo', ListTodo],
  ['Link2', Link2],
  ['KeyRound', KeyRound],
  ['RefreshCw', RefreshCw],
  ['ChevronRight', ChevronRight],
  ['Copy', Copy],
  ['Star', Star],
] as const;

export function IconGallery() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
        gap: 8,
        margin: '1.5rem 0',
      }}
    >
      {ICONS.map(([name, Icon]) => (
        <div
          key={name}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '16px 8px',
            border: '1px solid var(--color-fd-border)',
            borderRadius: 8,
          }}
        >
          <Icon size={20} strokeWidth={1.75} />
          <code style={{ fontSize: 11, opacity: 0.7 }}>{name}</code>
        </div>
      ))}
    </div>
  );
}
