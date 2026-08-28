import type { CSSProperties } from 'react';
import { Preview } from '@/components/showcase/preview';

const pulse: CSSProperties = {
  animation: 'nk-skeleton-pulse 1.4s ease-in-out infinite',
};

const avatar: CSSProperties = {
  ...pulse,
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'var(--color-fd-muted)',
  flexShrink: 0,
};

const line = (width: string | number): CSSProperties => ({
  ...pulse,
  height: 10,
  borderRadius: 5,
  background: 'var(--color-fd-muted)',
  width,
});

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
};

const lines: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  flex: 1,
};

const widths: [string, string][] = [
  ['60%', '40%'],
  ['80%', '55%'],
  ['50%', '35%'],
];

export function SkeletonShowcase() {
  return (
    <Preview>
      <style>{`
        @keyframes nk-skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          width: '100%',
          maxWidth: 360,
        }}
      >
        {widths.map(([titleWidth, subtitleWidth], index) => (
          <div key={index} style={row}>
            <div style={avatar} />
            <div style={lines}>
              <div style={line(titleWidth)} />
              <div style={line(subtitleWidth)} />
            </div>
          </div>
        ))}
      </div>
    </Preview>
  );
}
