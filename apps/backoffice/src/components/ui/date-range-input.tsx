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
import { differenceInDays, format, parse } from 'date-fns'
import { ChevronDownIcon, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'

export interface DateRangeInputProps extends Omit<
  React.ComponentProps<typeof Button>,
  'value' | 'defaultValue' | 'onChange'
> {
  /** The start date value as a string. Use for controlled mode. */
  startValue?: string | null
  /** Default start date value as a string. Use for uncontrolled mode. */
  defaultStartValue?: string | null
  /** The end date value as a string. Use for controlled mode. */
  endValue?: string | null
  /** Default end date value as a string. Use for uncontrolled mode. */
  defaultEndValue?: string | null
  /** Callback when date range changes. */
  onChange?: (startValue: string | null, endValue: string | null) => void
  /** Format for the value string (date-fns Unicode format). Defaults to "yyyy-MM-dd". */
  valueFormat?: string
  /** Format for displaying the date (date-fns Unicode format). Defaults to "MMM d, yyyy". */
  displayFormat?: string
  /** Placeholder text when no date is selected. */
  placeholder?: string
  /** Icon component to display before the date text. */
  icon?: LucideIcon
  /** Minimum selectable date (string in valueFormat, or "today" for current date). */
  minDate?: string
  /** Maximum selectable date (string in valueFormat, or "today" for current date). */
  maxDate?: string
  /** Minimum number of days that must be selected. */
  minDays?: number
  /** Maximum number of days that can be selected. */
  maxDays?: number
  /** Number of months to display. Defaults to 2. */
  numberOfMonths?: 1 | 2
}

export function DateRangeInput({
  startValue,
  defaultStartValue,
  endValue,
  defaultEndValue,
  onChange,
  valueFormat = 'yyyy-MM-dd',
  displayFormat = 'MMM d, yyyy',
  placeholder = '',
  disabled,
  className,
  icon: Icon,
  minDate,
  maxDate,
  minDays,
  maxDays,
  numberOfMonths = 2,
  ...props
}: DateRangeInputProps) {
  const [open, setOpen] = useState(false)
  const [internalStartValue, setInternalStartValue] = useControlledState<
    string | null
  >(startValue, defaultStartValue ?? null)
  const [internalEndValue, setInternalEndValue] = useControlledState<
    string | null
  >(endValue, defaultEndValue ?? null)

  // Store the last committed values to restore if user cancels partial selection
  const committedStartValue = useRef<string | null>(null)
  const committedEndValue = useRef<string | null>(null)

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

  const formatDateRange = (): string => {
    if (!internalStartValue) return placeholder
    if (!internalEndValue) return formatDisplayDate(internalStartValue)
    return `${formatDisplayDate(internalStartValue)} - ${formatDisplayDate(internalEndValue)}`
  }

  const handleSelect = (_range: DateRange | undefined, selectedDay: Date) => {
    try {
      const currentFrom = parseDate(internalStartValue)
      const currentTo = parseDate(internalEndValue)
      const hasCompleteRange = currentFrom && currentTo

      // If a complete range is already selected, reset with the clicked day as new start.
      // This matches the behavior of React Aria and Mantine date range pickers.
      if (hasCompleteRange) {
        const newStartValue = format(selectedDay, valueFormat)
        setInternalStartValue(newStartValue)
        setInternalEndValue(null)
        onChange?.(newStartValue, null)
        return
      }

      // If no start date, set the clicked day as start
      if (!currentFrom) {
        const newStartValue = format(selectedDay, valueFormat)
        setInternalStartValue(newStartValue)
        setInternalEndValue(null)
        onChange?.(newStartValue, null)
        return
      }

      // If we have a start but no end
      if (selectedDay < currentFrom) {
        // Clicked before current start: reset with clicked day as new start
        const newStartValue = format(selectedDay, valueFormat)
        setInternalStartValue(newStartValue)
        setInternalEndValue(null)
        onChange?.(newStartValue, null)
      } else if (selectedDay.getTime() === currentFrom.getTime()) {
        // Clicked on the same day as start: clear selection
        setInternalStartValue(null)
        setInternalEndValue(null)
        onChange?.(null, null)
      } else {
        // Clicked after current start: set as end date
        const newEndValue = format(selectedDay, valueFormat)
        setInternalEndValue(newEndValue)
        onChange?.(internalStartValue, newEndValue)
        setOpen(false)
      }
    } catch {
      setInternalStartValue(null)
      setInternalEndValue(null)
      onChange?.(null, null)
    }
  }

  const selectedRange: DateRange | undefined =
    internalStartValue || internalEndValue
      ? {
          from: parseDate(internalStartValue),
          to: parseDate(internalEndValue),
        }
      : undefined

  const isDateDisabled = (date: Date): boolean => {
    const min = minDate ? parseDate(minDate) : undefined
    const max = maxDate ? parseDate(maxDate) : undefined
    if (min && date < min) return true
    if (max && date > max) return true

    if (selectedRange?.from && !selectedRange?.to) {
      const daysDiff = differenceInDays(date, selectedRange.from)

      // When minDays is set, only allow forward selection (end date must be after start date)
      // Disable dates before the start date (negative daysDiff) and dates within minDays range
      if (minDays !== undefined) {
        if (daysDiff < 0) return true // Disable dates before start
        if (daysDiff > 0 && daysDiff < minDays - 1) return true // Disable dates within minDays range
      }

      // maxDays constraint - only applies to forward direction
      if (maxDays !== undefined && daysDiff > maxDays - 1) {
        return true
      }
    }

    return false
  }

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          // Save the current values when opening
          committedStartValue.current = internalStartValue
          committedEndValue.current = internalEndValue
        } else if (internalStartValue && !internalEndValue) {
          // Closing with only start date selected (no end), restore the committed values
          setInternalStartValue(committedStartValue.current)
          setInternalEndValue(committedEndValue.current)
          onChange?.(committedStartValue.current, committedEndValue.current)
        }
        setOpen(isOpen)
      }}
    >
      <PopoverTrigger disabled={disabled} asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !internalStartValue && 'text-muted-foreground',
            className,
          )}
          {...props}
        >
          {Icon && <Icon className="text-muted-foreground h-4 w-4" />}
          <span className="flex-1">{formatDateRange()}</span>
          <ChevronDownIcon className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          captionLayout="dropdown"
          startMonth={minDate ? parseDate(minDate) : new Date(1900, 0)}
          endMonth={maxDate ? parseDate(maxDate) : new Date(2100, 11)}
          selected={selectedRange}
          onSelect={handleSelect}
          disabled={isDateDisabled}
          numberOfMonths={numberOfMonths}
        />
      </PopoverContent>
    </Popover>
  )
}
