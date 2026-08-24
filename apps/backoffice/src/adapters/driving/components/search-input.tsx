import { SearchIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../utils/cn'
import { Input } from './ui/input'

interface SearchInputProps extends Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'onChange'
> {
  iconClassName?: string
  onValueChange?: (value: string) => void
}

function SearchInput({
  className,
  iconClassName,
  placeholder = 'Search...',
  value,
  onValueChange,
  ...props
}: SearchInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleClear = () => {
    onValueChange?.('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <SearchIcon
        className={cn(
          'text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2',
          iconClassName,
        )}
      />
      <Input
        ref={inputRef}
        className={cn('bg-background pr-9 pl-9', className)}
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export { SearchInput }
