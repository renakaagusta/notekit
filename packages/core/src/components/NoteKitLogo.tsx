/** Diagonal slash — used as favicon and inline mark. Monochrome: the slash
 * follows the neutral accent (near-black on light, near-white on dark). */
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
      <line
        x1="10.5" y1="26" x2="21.5" y2="6"
        stroke="var(--accent,#18181b)" strokeWidth="6.5" strokeLinecap="round"
      />
    </svg>
  );
}

/** "note/kit" wordmark. Monochrome: the slash is a quiet gray separator so it
 * still reads as a divider without the old amber pop. */
export function NoteKitWordmark({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1 }}
    >
      note
      <span style={{ color: "var(--muted,#a1a1aa)" }}>/</span>
      kit
    </span>
  );
}
