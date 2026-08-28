import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/showcase/button';
import { Preview } from '@/components/showcase/preview';

export function EmptyStateShowcase() {
  return (
    <Preview>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: '48px 24px',
          width: '100%',
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
            background: 'var(--color-fd-muted)',
          }}
        >
          <FileText
            size={28}
            strokeWidth={1.5}
            style={{ color: 'var(--color-fd-muted-foreground)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-fd-foreground)',
            }}
          >
            No notes yet
          </span>
          <span
            style={{
              fontSize: 13,
              color: 'var(--color-fd-muted-foreground)',
              maxWidth: 280,
            }}
          >
            Your notes will appear here once you create one.
          </span>
        </div>
        <Button variant="primary">
          <Plus size={14} strokeWidth={2} /> Create your first note
        </Button>
      </div>
    </Preview>
  );
}
