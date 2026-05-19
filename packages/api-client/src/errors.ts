// Error types thrown by the API client. Each surface (web, cli, desktop, mcp)
// catches these to translate into UI / exit codes / MCP errors.

export class NoteKitApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "NoteKitApiError";
  }
}

export class NoteKitNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "NoteKitNetworkError";
  }
}

export class NoteKitAuthError extends NoteKitApiError {
  constructor(message = "not authenticated") {
    super(401, "unauthenticated", message);
    this.name = "NoteKitAuthError";
  }
}
