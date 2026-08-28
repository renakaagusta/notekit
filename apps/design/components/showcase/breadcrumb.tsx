import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Preview } from '@/components/showcase/preview';

const crumbLink: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--color-fd-muted-foreground)',
  textDecoration: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const crumbCurrent: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--color-fd-foreground)',
  fontWeight: 590,
  whiteSpace: 'nowrap',
};

const separator: React.CSSProperties = {
  opacity: 0.4,
  flexShrink: 0,
};

interface BreadcrumbItem {
  label: string;
  href?: string;
}

function BreadcrumbRow({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="breadcrumb"
      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span
            key={item.label}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {isLast ? (
              <span style={crumbCurrent} aria-current="page">
                {item.label}
              </span>
            ) : (
              <>
                <a href={item.href ?? '#'} style={crumbLink}>
                  {item.label}
                </a>
                <ChevronRight size={12} style={separator} />
              </>
            )}
          </span>
        );
      })}
    </nav>
  );
}

const defaultItems: BreadcrumbItem[] = [
  { label: 'Personal', href: '#' },
  { label: 'Weekly review', href: '#' },
  { label: 'Monday' },
];

export function BreadcrumbShowcase() {
  return (
    <Preview>
      <div
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid var(--color-fd-border)',
          background: 'var(--color-fd-background)',
        }}
      >
        <BreadcrumbRow items={defaultItems} />
      </div>
    </Preview>
  );
}

export function BreadcrumbMobileShowcase() {
  return (
    <Preview>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid var(--color-fd-border)',
          background: 'var(--color-fd-background)',
        }}
      >
        <ChevronLeft size={14} style={{ ...separator, color: 'var(--color-fd-muted-foreground)' }} />
        <span style={crumbCurrent}>Monday</span>
      </div>
    </Preview>
  );
}
