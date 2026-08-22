/**
 * Outbound port for reading the current time. Use cases depend on this instead
 * of calling `Date.now()` / `new Date()` directly, so time is injectable and
 * tests are deterministic. Implemented by a driven adapter (system clock, or a
 * fixed clock in tests).
 */
export interface ClockPort {
  /** Current wall-clock time in epoch milliseconds. */
  now(): number;
  /** Current time as an ISO 8601 string. */
  nowIso(): string;
}
