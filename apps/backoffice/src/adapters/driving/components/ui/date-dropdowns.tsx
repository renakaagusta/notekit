'use client'

import { format, getDaysInMonth, parse } from 'date-fns'
import * as React from 'react'
import { cn } from '../../utils/cn'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

function getLocalizedMonths(locale?: string) {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' })
  return Array.from({ length: 12 }, (_, i) => ({
    value: padZero(i + 1),
    label: formatter.format(new Date(2000, i, 1)),
  }))
}

/** Gets localized placeholder for date field (day, month, year) */
function getLocalizedDateFieldName(
  field: 'day' | 'month' | 'year',
  locale?: string,
): string {
  try {
    const displayNames = new Intl.DisplayNames(locale, {
      type: 'dateTimeField',
    })
    const name = displayNames.of(field)
    // Capitalize first letter
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : field
  } catch {
    // Fallback if dateTimeField is not supported
    return field.charAt(0).toUpperCase() + field.slice(1)
  }
}

/** Pads a number with leading zero (e.g., 1 → "01", 12 → "12") */
function padZero(n: number): string {
  return String(n).padStart(2, '0')
}

/** Extracts day from Date as padded string (e.g., "01", "15") */
function getDayString(date: Date): string {
  return padZero(date.getDate())
}

/** Extracts month from Date as padded string (e.g., "01" for January) */
function getMonthString(date: Date): string {
  return padZero(date.getMonth() + 1)
}

/** Extracts year from Date as string */
function getYearString(date: Date): string {
  return String(date.getFullYear())
}

/** Parses padded day/month string to number (e.g., "01" → 1) */
function toNumber(str: string): number {
  return parseInt(str, 10)
}

/** Creates a Date from day, month (1-indexed), year strings */
function createDate(day: string, month: string, year: string): Date {
  return new Date(toNumber(year), toNumber(month) - 1, toNumber(day))
}

/** Checks if a date is before the min boundary */
function isBeforeMin(date: Date, minDate: Date | undefined): boolean {
  return minDate !== undefined && date < minDate
}

/** Checks if a date is after the max boundary */
function isAfterMax(date: Date, maxDate: Date | undefined): boolean {
  return maxDate !== undefined && date > maxDate
}

/** Checks if a date is outside the min/max range */
function isOutOfRange(
  date: Date,
  minDate: Date | undefined,
  maxDate: Date | undefined,
): boolean {
  return isBeforeMin(date, minDate) || isAfterMax(date, maxDate)
}

/** Option for day, month, or year dropdown */
interface SelectOption {
  value: string
  label: string
  disabled: boolean
}

export interface DateDropdownsProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue' | 'onBlur'
> {
  /** The date value as a string. Use for controlled mode. */
  value?: string | null
  /** Default date value as a string. Use for uncontrolled mode. */
  defaultValue?: string | null
  /** Callback when date changes. */
  onChange?: (value: string | null) => void
  /** Callback when focus leaves the component. */
  onBlur?: () => void
  /** Format for the value string (date-fns Unicode format). Defaults to "yyyy-MM-dd". */
  valueFormat?: string
  /** Minimum selectable date (string in valueFormat, or "today" for current date). */
  minDate?: string
  /** Maximum selectable date (string in valueFormat, or "today" for current date). */
  maxDate?: string
  /** Placeholder for day select. */
  dayPlaceholder?: string
  /** Placeholder for month select. */
  monthPlaceholder?: string
  /** Placeholder for year select. */
  yearPlaceholder?: string
  /** Whether the input is disabled. */
  disabled?: boolean
  /** Whether the input is invalid. */
  'aria-invalid'?: boolean
  /** Size of the select triggers. */
  size?: 'sm' | 'default'
  /** Name attribute for form submission. */
  name?: string
  /** Locale for month names (e.g., "en-US", "fr-FR"). Defaults to user's locale. */
  locale?: string
}

export function DateDropdowns({
  value,
  defaultValue,
  onChange,
  onBlur,
  valueFormat = 'yyyy-MM-dd',
  minDate: minDateString,
  maxDate: maxDateString,
  dayPlaceholder,
  monthPlaceholder,
  yearPlaceholder,
  disabled,
  'aria-invalid': ariaInvalid,
  size = 'default',
  name,
  locale,
  className,
  ...props
}: DateDropdownsProps) {
  // Get localized placeholders if not provided
  const dayLabel = dayPlaceholder || getLocalizedDateFieldName('day', locale)
  const monthLabel =
    monthPlaceholder || getLocalizedDateFieldName('month', locale)
  const yearLabel = yearPlaceholder || getLocalizedDateFieldName('year', locale)
  const parseDate = React.useCallback(
    (dateString: string | null): Date | undefined => {
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
    },
    [valueFormat],
  )

  const minDate = React.useMemo(
    () => (minDateString ? parseDate(minDateString) : undefined),
    [minDateString, parseDate],
  )
  const maxDate = React.useMemo(
    () => (maxDateString ? parseDate(maxDateString) : undefined),
    [maxDateString, parseDate],
  )

  // Parse initial value for initial state
  const initialDate = React.useMemo(() => {
    const v = value !== undefined ? value : defaultValue
    return parseDate(v ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once on mount; parseDate and value/defaultValue are stable initial props
  }, [])

  // Track individual selections separately (allows partial selections)
  const [selectedDayString, setSelectedDayString] = React.useState<string>(
    initialDate ? getDayString(initialDate) : '',
  )
  const [selectedMonthString, setSelectedMonthString] = React.useState<string>(
    initialDate ? getMonthString(initialDate) : '',
  )
  const [selectedYearString, setSelectedYearString] = React.useState<string>(
    initialDate ? getYearString(initialDate) : '',
  )

  // Sync from external controlled value
  React.useEffect(() => {
    if (value !== undefined) {
      const parsedDate = parseDate(value)
      if (parsedDate) {
        setSelectedDayString(getDayString(parsedDate))
        setSelectedMonthString(getMonthString(parsedDate))
        setSelectedYearString(getYearString(parsedDate))
      } else if (value === null) {
        setSelectedDayString('')
        setSelectedMonthString('')
        setSelectedYearString('')
      }
    }
  }, [value, parseDate])

  const minYear = minDate?.getFullYear() ?? 1900
  const maxYear = maxDate?.getFullYear() ?? new Date().getFullYear()

  const yearStrings = React.useMemo(() => {
    const result: string[] = []
    for (let year = maxYear; year >= minYear; year--) {
      result.push(String(year))
    }
    return result
  }, [minYear, maxYear])

  const monthOptions = React.useMemo(() => getLocalizedMonths(locale), [locale])

  const getAvailableMonths = React.useCallback((): SelectOption[] => {
    return monthOptions.map((monthString) => {
      let disabled = false
      const monthIndex = toNumber(monthString.value) - 1

      if (selectedYearString) {
        const year = toNumber(selectedYearString)

        if (selectedDayString) {
          // Day is selected: check if this specific date is valid
          const date = new Date(year, monthIndex, toNumber(selectedDayString))
          disabled = isOutOfRange(date, minDate, maxDate)
        } else {
          // No day selected: disable if entire month is out of range
          const isBeforeMinMonth =
            minDate &&
            year === minDate.getFullYear() &&
            monthIndex < minDate.getMonth()
          const isAfterMaxMonth =
            maxDate &&
            year === maxDate.getFullYear() &&
            monthIndex > maxDate.getMonth()
          disabled = Boolean(isBeforeMinMonth || isAfterMaxMonth)
        }
      }

      return { ...monthString, disabled }
    })
  }, [selectedYearString, selectedDayString, minDate, maxDate, monthOptions])

  const getAvailableDays = React.useCallback((): SelectOption[] => {
    const year = selectedYearString
      ? toNumber(selectedYearString)
      : new Date().getFullYear()
    const month = selectedMonthString ? toNumber(selectedMonthString) - 1 : 0
    const daysInMonth = getDaysInMonth(new Date(year, month))

    const options: SelectOption[] = []
    for (let day = 1; day <= daysInMonth; day++) {
      const value = padZero(day)
      let disabled = false
      if (selectedYearString && selectedMonthString) {
        const date = new Date(year, month, day)
        disabled = isOutOfRange(date, minDate, maxDate)
      }
      options.push({ value, label: String(day), disabled })
    }
    return options
  }, [selectedYearString, selectedMonthString, minDate, maxDate])

  // Notify parent when a complete date is formed
  const notifyChange = React.useCallback(
    (dayString: string, monthString: string, yearString: string) => {
      if (dayString && monthString && yearString) {
        try {
          const date = createDate(dayString, monthString, yearString)
          onChange?.(format(date, valueFormat))
        } catch {
          onChange?.(null)
        }
      } else {
        onChange?.(null)
      }
    },
    [valueFormat, onChange],
  )

  const handleDayChange = (dayString: string) => {
    setSelectedDayString(dayString)
    notifyChange(dayString, selectedMonthString, selectedYearString)
  }

  const handleMonthChange = (monthString: string) => {
    let dayString = selectedDayString
    if (selectedDayString && selectedYearString) {
      const daysInNewMonth = getDaysInMonth(
        new Date(toNumber(selectedYearString), toNumber(monthString) - 1),
      )
      if (toNumber(selectedDayString) > daysInNewMonth) {
        dayString = padZero(daysInNewMonth)
        setSelectedDayString(dayString)
      }
    }
    setSelectedMonthString(monthString)
    notifyChange(dayString, monthString, selectedYearString)
  }

  const handleYearChange = (yearString: string) => {
    let dayString = selectedDayString
    let monthString = selectedMonthString

    if (selectedMonthString) {
      const monthIndex = toNumber(selectedMonthString) - 1
      const yearNum = toNumber(yearString)

      // Adjust month if it becomes out of range for the new year
      const isBeforeMinMonth =
        minDate &&
        yearNum === minDate.getFullYear() &&
        monthIndex < minDate.getMonth()
      const isAfterMaxMonth =
        maxDate &&
        yearNum === maxDate.getFullYear() &&
        monthIndex > maxDate.getMonth()

      if (isBeforeMinMonth) {
        monthString = getMonthString(minDate)
      } else if (isAfterMaxMonth) {
        monthString = getMonthString(maxDate)
      }
    }

    if (dayString && monthString) {
      const daysInMonth = getDaysInMonth(
        new Date(toNumber(yearString), toNumber(monthString) - 1),
      )
      if (toNumber(dayString) > daysInMonth) {
        dayString = padZero(daysInMonth)
      }
    }

    setSelectedDayString(dayString)
    setSelectedMonthString(monthString)
    setSelectedYearString(yearString)
    notifyChange(dayString, monthString, yearString)
  }

  const getAvailableYears = React.useCallback((): SelectOption[] => {
    return yearStrings.map((yearString) => {
      let disabled = false
      if (selectedDayString && selectedMonthString) {
        const date = createDate(
          selectedDayString,
          selectedMonthString,
          yearString,
        )
        disabled = isOutOfRange(date, minDate, maxDate)
      }
      return { value: yearString, label: yearString, disabled }
    })
  }, [yearStrings, selectedDayString, selectedMonthString, minDate, maxDate])

  const availableMonths = getAvailableMonths()
  const availableDays = getAvailableDays()
  const availableYears = getAvailableYears()

  const containerRef = React.useRef<HTMLDivElement>(null)

  const handleBlur = React.useCallback(
    (e: React.FocusEvent) => {
      // Check if the new focus target is outside the container
      if (
        onBlur &&
        containerRef.current &&
        !containerRef.current.contains(e.relatedTarget as Node)
      ) {
        onBlur()
      }
    },
    [onBlur],
  )

  return (
    <div
      ref={containerRef}
      data-slot="date-dropdowns"
      className={cn('flex gap-2', className)}
      onBlur={handleBlur}
      {...props}
    >
      <Select
        value={selectedDayString || undefined}
        onValueChange={handleDayChange}
        disabled={disabled}
      >
        <SelectTrigger
          size={size}
          aria-invalid={ariaInvalid}
          aria-label={dayLabel}
          className="w-1/4 min-w-20"
        >
          <SelectValue placeholder={dayLabel} />
        </SelectTrigger>
        <SelectContent>
          {availableDays.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedMonthString || undefined}
        onValueChange={handleMonthChange}
        disabled={disabled}
      >
        <SelectTrigger
          size={size}
          aria-invalid={ariaInvalid}
          aria-label={monthLabel}
          className="min-w-30 grow"
        >
          <SelectValue placeholder={monthLabel} />
        </SelectTrigger>
        <SelectContent>
          {availableMonths.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedYearString || undefined}
        onValueChange={handleYearChange}
        disabled={disabled}
      >
        <SelectTrigger
          size={size}
          aria-invalid={ariaInvalid}
          aria-label={yearLabel}
          className="w-1/4 min-w-24"
        >
          <SelectValue placeholder={yearLabel} />
        </SelectTrigger>
        <SelectContent>
          {availableYears.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {name && (
        <input
          type="hidden"
          name={name}
          value={
            selectedDayString && selectedMonthString && selectedYearString
              ? format(
                  createDate(
                    selectedDayString,
                    selectedMonthString,
                    selectedYearString,
                  ),
                  valueFormat,
                )
              : ''
          }
        />
      )}
    </div>
  )
}
