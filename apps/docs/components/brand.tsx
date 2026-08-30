// NoteKit brand mark — the monochrome diagonal slash. Mirrors the product mark
// (packages/core NoteKitLogo): stroke follows the current text color so it reads
// near-black on light and near-white on dark. This is a brand asset, not shared
// UI logic, so the docs site owns its own copy rather than importing core.
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
      <span style={{ fontWeight: 500, opacity: 0.55, letterSpacing: '-0.01em' }}>Docs</span>
    </span>
  );
}
