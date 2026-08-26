/**
 * Turn a failed git-provider (Forgejo/GitHub/GitLab) response into a
 * {@link GhError} AND record the third-party call's outcome on the active
 * span — the URL, status, and (critically) the provider's RESPONSE BODY.
 *
 * OTel's auto HTTP instrumentation gives us the outbound method/url/status,
 * but never the response body, so a third-party failure like Forgejo's
 * "UpdateFile: object does not exist" is invisible in Tempo. This attaches it.
 * Write paths additionally record the request payload (method/path/sha) via
 * {@link recordGitRequest} so a PUT-vs-POST/sha bug is diagnosable from the
 * trace alone. See the Observability rule in CLAUDE.md.
 */
import { trace } from "@opentelemetry/api";
import { GhError } from "../../../domain/errors";

const MAX_BODY = 4000;

/** Reads the failed response body, records it on the span, returns the error to throw. */
export async function gitError(res: Response): Promise<GhError> {
  const body = await res.text();
  const span = trace.getActiveSpan();
  if (span) {
    if (res.url) span.setAttribute("git.request.url", res.url);
    span.setAttribute("git.response.status_code", res.status);
    span.setAttribute("git.response.body", body.slice(0, MAX_BODY));
  }
  return new GhError(res.status, body);
}

/**
 * Record the request payload of a git-provider WRITE on the active span — the
 * method, target path, and prior sha (the field that decides create vs update).
 * Content bytes are deliberately NOT recorded (large + user data).
 */
export function recordGitRequest(
  provider: string,
  method: string,
  path: string,
  sha?: string,
): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.setAttribute("git.provider", provider);
  span.setAttribute("git.request.method", method);
  span.setAttribute("git.request.path", path);
  span.setAttribute("git.request.sha", sha ?? "(none → create)");
}
