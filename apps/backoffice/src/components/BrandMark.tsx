import { cn } from '@/utils/cn'

// NoteKit backoffice logo — orange rounded square with a white slash mark,
// echoing the app's NotekitIcon but in the brand's signature orange.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8', className)} aria-hidden>
      <rect x="0" y="0" width="64" height="64" rx="14.08" fill="#ea7317" />
      <path
        d="M40.5 18 L27.5 46"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  )
}
