// NoteKit brand mark — the monochrome diagonal slash. Mirrors the product mark
// (packages/core NoteKitLogo): stroke follows the current text color so it reads
// near-black on light and near-white on dark. This is a brand asset, not shared
// UI logic, so the design site owns its own copy rather than importing core.
export function NoteKitMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <line
        x1="10.5"
        y1="26"
        x2="21.5"
        y2="6"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandLockup() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <NoteKitMark size={20} />
      <span style={{ fontWeight: 700, letterSpacing: '-0.025em' }}>Notekit</span>
      <span style={{ fontWeight: 500, opacity: 0.55, letterSpacing: '-0.01em' }}>Design</span>
    </span>
  );
}

const tile: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  height: 160,
  borderRadius: 10,
  border: '1px solid var(--color-fd-border)',
};

export function BrandShowcase() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        margin: '1.5rem 0',
      }}
    >
      <div style={{ ...tile, background: '#0a0a0b', color: '#e4e4e7' }}>
        <NoteKitMark size={40} />
        <span style={{ fontWeight: 700, letterSpacing: '-0.025em', fontSize: 18 }}>Notekit</span>
      </div>
      <div style={{ ...tile, background: '#fafafa', color: '#18181b' }}>
        <NoteKitMark size={40} />
        <span style={{ fontWeight: 700, letterSpacing: '-0.025em', fontSize: 18 }}>Notekit</span>
      </div>
    </div>
  );
}
