import { cn } from '../utils/cn'

interface InfoFieldProps {
  label: string
  value?: string | number
  children?: React.ReactNode
  className?: string
  labelClassName?: string
  valueClassName?: string
}

export function InfoField({
  label,
  value,
  children,
  className,
  labelClassName,
  valueClassName,
}: InfoFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className={cn('text-muted-foreground text-sm', labelClassName)}>
        {label}
      </div>
      <div className={cn('text-sm', valueClassName)}>{children || value}</div>
    </div>
  )
}
