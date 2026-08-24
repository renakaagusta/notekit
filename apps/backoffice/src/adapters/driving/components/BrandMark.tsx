import { cn } from '../utils/cn'

// NoteKit mark — the diagonal slash, monochrome. Uses currentColor so it
// adapts to the surrounding text color (near-black on light, near-white on
// dark), matching app.notekit.online's black/white brand.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} fill="none" aria-hidden>
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
  )
}
