import { cn } from '../utils/cn'

interface AppContentProps {
  children: React.ReactNode
  className?: string
  innerClassName?: string
}

export function AppContent({
  children,
  className,
  innerClassName,
}: AppContentProps) {
  return (
    <div className={cn('relative flex-1', className)}>
      <div
        className={cn(
          'absolute inset-0 flex flex-col gap-6 overflow-y-auto p-6',
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
