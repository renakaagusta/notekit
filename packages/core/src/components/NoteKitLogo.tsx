/** Rounded-square with amber diagonal slash — used as favicon and inline mark. */
export function NoteKitMark({ size = 24, className }: { size?: number; className?: string }) {
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
      <rect
        x="2.25" y="2.25" width="27.5" height="27.5" rx="6.5"
        stroke="currentColor" strokeWidth="2.5"
      />
      <line
        x1="10.5" y1="26" x2="21.5" y2="6"
        stroke="var(--accent,#f5a623)" strokeWidth="6.5" strokeLinecap="round"
      />
    </svg>
  );
}

/** "note/kit" wordmark with the slash rendered in the accent colour. */
export function NoteKitWordmark({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1 }}
    >
      note
      <span style={{ color: "var(--accent,#f5a623)" }}>/</span>
      kit
    </span>
  );
}
