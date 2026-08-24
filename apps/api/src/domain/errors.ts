/**
 * Domain errors shared across layers. These are pure `Error` subclasses with no
 * external dependencies, so any layer (including driving adapters mapping them
 * to HTTP status codes) may `instanceof`-check them without importing a driven
 * adapter.
 */

/**
 * A git vault backend (GitHub / Forgejo) returned a non-OK response. Carries the
 * upstream HTTP status and body so callers can surface it. Driven git adapters
 * throw this; driving adapters map it to a transport status.
 */
export class GhError extends Error {
  constructor(public status: number, public body: string) {
    super(`GitHub API ${status}: ${body.slice(0, 200)}`);
    this.name = "GhError";
  }
}
