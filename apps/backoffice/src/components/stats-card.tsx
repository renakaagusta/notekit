import { cn } from '@/utils/cn'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  description?: string
  value: string | number
  icon?: React.ComponentType<{ className?: string }>
  link?: {
    href: string
    label: string
  }
  accentClassName?: string
}

export function StatsCard({
  title,
  description,
  value,
  icon: Icon,
  link,
}: StatsCardProps) {
  return (
    <div className="bg-card relative flex flex-col justify-between">
      <div className="bg-muted absolute inset-x-0 top-0 h-1" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm font-medium">{title}</p>
          {Icon && <Icon className={cn('text-muted-foreground size-5')} />}
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold">{value}</h3>
        </div>
        {description && (
          <p className="text-muted-foreground min-h-10 text-sm">
            {description}
          </p>
        )}
      </div>
      {link && (
        <div className="border-t p-4">
          <Link
            to={link.href}
            className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm font-medium transition-colors"
          >
            {link.label}
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
