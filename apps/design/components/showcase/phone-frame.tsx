import type { ReactNode } from 'react';

// A small phone bezel for showing mobile-specific variants in context. Content is
// positioned relative to the frame so sheets/toasts can anchor to its edges.
export function PhoneFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          position: 'relative',
          width: 268,
          height: 520,
          borderRadius: 34,
          border: '8px solid #18181b',
          background: 'var(--color-fd-background)',
          overflow: 'hidden',
          boxShadow: '0px 7px 32px rgba(0,0,0,0.28)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 96,
            height: 20,
            background: '#18181b',
            borderRadius: '0 0 12px 12px',
            zIndex: 5,
          }}
        />
        {children}
      </div>
      {label ? (
        <span style={{ fontSize: 12, color: 'var(--color-fd-muted-foreground)' }}>{label}</span>
      ) : null}
    </div>
  );
}
