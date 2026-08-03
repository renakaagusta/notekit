'use client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useControlledState } from '@/hooks/use-controlled-state'
import { cn } from '@/utils/cn'
import { format, parse } from 'date-fns'
import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'
import { useState } from 'react'

export interface DateInputProps extends Omit<
  React.ComponentProps<typeof Button>,
  'value' | 'defaultValue' | 'onChange'
> {
  /** The date value as a string. Use for controlled mode. */
  value?: string | null
  /** Default date value as a string. Use for uncontrolled mode. */
  defaultValue?: string | null
  /** Callback when date changes. */
  onChange?: (value: string | null) => void
  /** Format for the value string (date-fns Unicode format). Defaults to "yyyy-MM-dd". */
  valueFormat?: string
  /** Format for displaying the date (date-fns Unicode format). Defaults to "MMMM d, yyyy". */
  displayFormat?: string
  /** Placeholder text when no date is selected. */
  placeholder?: string
  /** Icon displayed before the date text (React node). */
  icon?: React.ReactNode
  /** Minimum selectable date (string in valueFormat, or "today" for current date). */
  minDate?: string
  /** Maximum selectable date (string in valueFormat, or "today" for current date). */
  maxDate?: string
}

export function DateInput({
  value,
  defaultValue,
  onChange,
  valueFormat = 'yyyy-MM-dd',
  displayFormat = 'MMM d, yyyy',
  placeholder,
  disabled,
  className,
  icon,
  minDate,
  maxDate,
  name,
  ...props
}: DateInputProps) {
  const [open, setOpen] = useState(false)
  const [internalValue, setInternalValue] = useControlledState<string | null>(
    value,
    defaultValue ?? null,
    onChange,
  )

  const parseDate = (dateString: string | null): Date | undefined => {
    if (!dateString) return undefined
    if (dateString === 'today') {
      const now = new Date()
      return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }
    try {
      return parse(dateString, valueFormat, new Date())
    } catch {
      return undefined
    }
  }

  const formatDisplayDate = (dateString: string | null): string => {
    const date = parseDate(dateString)
    if (!date) return ''
    try {
      return format(date, displayFormat)
    } catch {
      return ''
    }
  }

  const handleSelect = (date: Date | undefined) => {
    if (!date) {
      setInternalValue(null)
      return
    }
    try {
      const formatted = format(date, valueFormat)
      setInternalValue(formatted)
      setOpen(false)
    } catch {
      setInternalValue(null)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {name && <input type="hidden" name={name} value={internalValue ?? ''} />}
      <PopoverTrigger disabled={disabled} asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !internalValue && 'text-muted-foreground',
            className,
          )}
          {...props}
        >
          {icon && (
            <span className="text-muted-foreground h-4 w-4 [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </span>
          )}
          <span className="flex-1">
            {internalValue ? formatDisplayDate(internalValue) : placeholder}
          </span>
          <ChevronDownIcon className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={minDate ? parseDate(minDate) : new Date(1900, 0)}
          endMonth={maxDate ? parseDate(maxDate) : new Date(2100, 11)}
          selected={parseDate(internalValue)}
          onSelect={handleSelect}
          disabled={(date) => {
            const min = minDate ? parseDate(minDate) : undefined
            const max = maxDate ? parseDate(maxDate) : undefined
            if (min && date < min) return true
            if (max && date > max) return true
            return false
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
