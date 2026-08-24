import { format } from 'date-fns'

/**
 * Converts camelCase, snake_case, or kebab-case strings to Title Case
 * @example
 * toTitleCase('userAgent') // 'User Agent'
 * toTitleCase('user_agent') // 'User Agent'
 * toTitleCase('user-agent') // 'User Agent'
 */
export function toTitleCase(str: string): string {
  return (
    str
      // Insert space before uppercase letters (camelCase)
      .replace(/([A-Z])/g, ' $1')
      // Replace underscores and hyphens with spaces
      .replace(/[_-]/g, ' ')
      // Capitalize first letter of each word
      .replace(/\b\w/g, (char) => char.toUpperCase())
      // Clean up extra spaces
      .trim()
  )
}

/**
 * Flattens a nested object into a flat object with combined keys
 * Uses '::' as separator to avoid conflicts with toTitleCase hyphen handling
 * @example
 * flattenObjectForDisplay({ address: { city: 'NYC', state: 'NY' } })
 * // { 'address::city': 'NYC', 'address::state': 'NY' }
 * flattenObjectForDisplay({ name: 'John', age: 30 })
 * // { name: 'John', age: 30 }
 */
export function flattenObjectForDisplay(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      // Recursively flatten nested objects
      const flattened = flattenObjectForDisplay(
        value as Record<string, unknown>,
      )
      for (const [nestedKey, nestedValue] of Object.entries(flattened)) {
        result[`${key}::${nestedKey}`] = nestedValue
      }
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Converts a flattened key to title case, preserving the separator as " - "
 * @example
 * flattenedKeyToTitleCase('address::city') // 'Address - City'
 * flattenedKeyToTitleCase('userName') // 'User Name'
 */
export function flattenedKeyToTitleCase(key: string): string {
  return key
    .split('::')
    .map((part) => toTitleCase(part))
    .join(' • ')
}

/**
 * Formats a value for display, detecting and prettifying special formats like dates
 * @example
 * formatDisplayValue(true) // '✓'
 * formatDisplayValue(false) // '✗'
 * formatDisplayValue('2026-01-11T09:30:27.014Z') // 'Jan 11, 2026, 9:30 AM'
 * formatDisplayValue('2024-04-07') // 'Apr 7, 2024'
 * formatDisplayValue('hello') // 'hello'
 * formatDisplayValue({ foo: 'bar' }) // '{\n  "foo": "bar"\n}'
 * formatDisplayValue(1234567) // '1,234,567'
 * formatDisplayValue(['a', 'b', 'c']) // 'a, b, c'
 */
export function formatDisplayValue(value: unknown): string {
  // Handle booleans with emoji
  if (typeof value === 'boolean') {
    return value ? '✅ Yes' : '❌ No'
  }

  // Handle numbers with thousands separator
  if (typeof value === 'number') {
    return value.toLocaleString()
  }

  // Handle arrays by joining with comma
  if (Array.isArray(value)) {
    return value.join(', ')
  }

  // Handle objects
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2)
  }

  // Convert to string
  const strValue = String(value)

  // Valid year (1900-2199), month (01-12) and day (01-31) pattern
  const validDatePart =
    '(19|20|21)\\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])'
  // ISO 8601 datetime pattern (e.g., 2026-01-11T09:30:27.014Z)
  const isoDateTimeRegex = new RegExp(
    `^${validDatePart}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z?$`,
  )
  // Simple date pattern (e.g., 2024-04-07)
  const simpleDateRegex = new RegExp(`^${validDatePart}$`)

  // Check if it's an ISO datetime string
  if (isoDateTimeRegex.test(strValue)) {
    const date = new Date(strValue)
    if (!isNaN(date.getTime())) {
      return format(date, 'MMM d, yyyy, h:mm a')
    }
  }

  // Check if it's a simple date string
  if (simpleDateRegex.test(strValue)) {
    const date = new Date(strValue + 'T00:00:00')
    if (!isNaN(date.getTime())) {
      return format(date, 'MMM d, yyyy')
    }
  }

  return strValue
}
