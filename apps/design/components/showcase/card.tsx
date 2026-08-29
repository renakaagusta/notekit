import { FileText, MoreHorizontal } from 'lucide-react';
import { Preview } from '@/components/showcase/preview';

const card: React.CSSProperties = {
  width: 240,
  background: 'var(--color-fd-card)',
  border: '1px solid var(--color-fd-border)',
  borderRadius: 8,
  overflow: 'hidden',
};

export function CardShowcase() {
  return (
    <Preview>
      <div style={card}>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FileText size={15} strokeWidth={1.75} style={{ opacity: 0.7 }} />
              <strong style={{ fontSize: 13.5 }}>Weekly review</strong>
            </span>
            <MoreHorizontal size={15} style={{ opacity: 0.5 }} />
          </div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--color-fd-muted-foreground)',
            }}
          >
            Shipped the token consolidation across web, backoffice, and landing…
          </p>
        </div>
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--color-fd-border)',
            fontSize: 12,
            color: 'var(--color-fd-muted-foreground)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Personal</span>
          <span>2h ago</span>
        </div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <strong style={{ fontSize: 13.5 }}>Plain card</strong>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--color-fd-muted-foreground)',
          }}
        >
          A quiet surface for grouping related content — one border, no shadow at rest.
        </p>
      </div>
    </Preview>
  );
}
