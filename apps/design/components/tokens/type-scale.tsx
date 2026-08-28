import { tokens, leaf } from '@/lib/tokens';

export function TypeScale() {
  const sizes = tokens
    .filter((token) => token.path[0] === 'font' && token.path[1] === 'size')
    .sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

  return (
    <div style={{ margin: '1.5rem 0', display: 'grid', gap: 4 }}>
      {sizes.map((token) => (
        <div
          key={token.name}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 16,
            padding: '8px 0',
            borderBottom: '1px solid var(--color-fd-border)',
          }}
        >
          <code style={{ width: 88, flexShrink: 0, opacity: 0.7, fontSize: 12 }}>
            {leaf(token)}
          </code>
          <code style={{ width: 64, flexShrink: 0, opacity: 0.5, fontSize: 12 }}>
            {token.value}
          </code>
          <span style={{ fontSize: token.value, lineHeight: 1.2 }}>
            The quick brown fox
          </span>
        </div>
      ))}
    </div>
  );
}
