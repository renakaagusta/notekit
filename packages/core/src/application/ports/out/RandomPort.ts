/**
 * Outbound port for randomness. Use cases depend on this instead of calling
 * `Math.random()` directly, so sampling/shuffling is injectable and tests are
 * reproducible.
 */
export interface RandomPort {
  /** A float in the half-open interval [0, 1). */
  next(): number;
}
