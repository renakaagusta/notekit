/**
 * Outbound port for generating identifiers. Use cases depend on this instead of
 * calling `nanoid()` / `crypto.randomUUID()` directly, so id generation is
 * injectable and tests can assert on deterministic ids.
 */
export interface IdGeneratorPort {
  /** A new opaque, collision-resistant identifier. */
  generate(): string;
}
