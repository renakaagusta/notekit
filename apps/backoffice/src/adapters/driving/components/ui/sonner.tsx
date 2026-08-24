import {
  AlertTriangleIcon,
  CheckIcon,
  InfoIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: (
          <CheckIcon className="size-4 text-green-600 dark:text-green-500" />
        ),
        info: <InfoIcon className="size-4 text-blue-600 dark:text-blue-500" />,
        warning: (
          <AlertTriangleIcon className="size-4 text-yellow-600 dark:text-yellow-500" />
        ),
        error: <XIcon className="size-4 text-red-600 dark:text-red-500" />,
        loading: (
          <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
        ),
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--popover)',
          '--success-text': 'var(--popover-foreground)',
          '--success-border': 'var(--border)',
          '--error-bg': 'var(--popover)',
          '--error-text': 'var(--popover-foreground)',
          '--error-border': 'var(--border)',
          '--warning-bg': 'var(--popover)',
          '--warning-text': 'var(--popover-foreground)',
          '--warning-border': 'var(--border)',
          '--info-bg': 'var(--popover)',
          '--info-text': 'var(--popover-foreground)',
          '--info-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
