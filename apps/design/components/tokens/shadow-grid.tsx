import { byCategory, leaf } from '@/lib/tokens';

export function ShadowGrid() {
  const shadows = byCategory('shadow');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 24,
        margin: '2rem 0',
        padding: 24,
        background: 'var(--color-fd-muted)',
        borderRadius: 8,
      }}
    >
      {shadows.map((token) => (
        <div key={token.name} style={{ textAlign: 'center' }}>
          <div
            style={{
              height: 72,
              background: 'var(--color-fd-card)',
              borderRadius: 8,
              boxShadow: token.value,
            }}
          />
          <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13 }}>
            {leaf(token)}
          </div>
          {token.description ? (
            <div style={{ fontSize: 12, opacity: 0.6 }}>{token.description}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
