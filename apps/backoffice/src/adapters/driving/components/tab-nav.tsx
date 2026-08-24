import { Link } from '@tanstack/react-router'
import { cn } from '../utils/cn'

export interface TabNavItem {
  title: string
  url: string
}

interface TabNavProps {
  tabs: TabNavItem[]
  className?: string
}

export function TabNav({ tabs, className }: TabNavProps) {
  return (
    <div className={cn('flex gap-2', className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.url}
          to={tab.url}
          className="rounded-full px-3 py-2 text-sm font-medium"
          activeProps={{
            className: 'bg-muted',
          }}
        >
          {tab.title}
        </Link>
      ))}
    </div>
  )
}
