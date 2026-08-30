import { byCategory, leaf, type DesignToken } from '@/lib/tokens';

function pixels(token: DesignToken): number {
  const match = /([\d.]+)px/.exec(token.value);
  return match ? Number(match[1]) : 0;
}

export function ScaleTable({
  category,
  orientation = 'horizontal',
}: {
  category: string;
  orientation?: 'horizontal' | 'vertical';
}) {
  const rows = byCategory(category).filter((token) => token.value.includes('px'));
  const max = Math.max(...rows.map(pixels), 1);

  return (
    <table style={{ width: '100%', margin: '1.5rem 0' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', width: 120 }}>Token</th>
          <th style={{ textAlign: 'left', width: 90 }}>Value</th>
          <th style={{ textAlign: 'left' }}>Scale</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((token) => {
          const size = pixels(token);
          const bar =
            orientation === 'vertical'
              ? { width: 24, height: size }
              : { width: `${(size / max) * 100}%`, height: 16 };
          return (
            <tr key={token.name}>
              <td>
                <code>{leaf(token)}</code>
              </td>
              <td style={{ opacity: 0.7 }}>{token.value}</td>
              <td>
                <div
                  style={{
                    background: 'var(--color-fd-primary)',
                    borderRadius: 4,
                    ...bar,
                  }}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
