import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useTheme } from 'next-themes'
import { useState } from 'react'

import { cn } from '@/utils/cn'

const themes = [
  { key: 'light', icon: SunIcon, label: 'Light theme' },
  { key: 'dark', icon: MoonIcon, label: 'Dark theme' },
  { key: 'system', icon: MonitorIcon, label: 'System theme' },
]

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted] = useState(() => typeof window !== 'undefined')

  if (!mounted) {
    return null
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
        {themes.map(({ key, icon: Icon, label }) => {
          const isActive = theme === key
          return (
            <button
              aria-label={label}
              className="relative size-5 rounded-full"
              key={key}
              onClick={() => setTheme(key)}
              type="button"
            >
              {isActive && (
                <motion.div
                  className="bg-secondary absolute inset-0 rounded-full"
                  layoutId="activeTheme"
                  transition={{ type: 'spring', duration: 0.5 }}
                />
              )}
              <Icon
                className={cn(
                  'relative z-10 m-auto h-4 w-4',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              />
            </button>
          )
        })}
    </div>
  )
}
