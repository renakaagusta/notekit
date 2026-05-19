/**
 * AccessTokensView — manages personal access tokens used by the NoteKit CLI
 * and MCP server. Surfaces three things:
 *
 *   1. A list of existing (non-revoked) tokens, with scope, name, age, and
 *      last-used time.
 *   2. A mint form (name + scope).
 *   3. A one-time secret reveal — the plaintext is shown EXACTLY ONCE; we
 *      cannot retrieve it again because the server only stores its hash.
 *
 * Uses @notekit/api-client directly (nk.auth.*) so new code in core sets the
 * migration pattern away from the apiFetch-based *-api.ts wrappers.
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { nk } from "../lib/api";
import "./AccessTokensView.css";
import type {
  NewPersonalAccessToken,
  PersonalAccessTokenScope,
  PersonalAccessTokenSummary,
} from "@notekit/api-client";
import { SkeletonLines } from "./Skeleton";

export function AccessTokensView() {
  const [tokens, setTokens] = useState<PersonalAccessTokenSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftScope, setDraftScope] = useState<PersonalAccessTokenScope>("mcp");
  const [reveal, setReveal] = useState<NewPersonalAccessToken | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await nk.auth.listTokens();
      setTokens(res.tokens);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    setBusy("create");
    setError(null);
    try {
      const minted = await nk.auth.createToken({ name, scope: draftScope });
      setReveal(minted);
      setDraftName("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("Revoke this token? Any client using it will lose access immediately.")) {
      return;
    }
    setBusy(`revoke:${id}`);
    setError(null);
    try {
      await nk.auth.revokeToken(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copyReveal() {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in non-HTTPS contexts or sandboxed webviews;
      // the textarea below remains selectable so the user can copy manually.
    }
  }

  if (!tokens) return <SkeletonLines count={3} />;

  return (
    <div className="access-tokens">
      {error && <div className="error">{error}</div>}

      {reveal && (
        <section className="token-reveal">
          <header>
            <strong>Copy your token now</strong>
            <p className="muted">
              This is the only time the full token is shown. If you lose it
              you'll need to revoke and mint a new one.
            </p>
          </header>
          <div className="token-reveal__row">
            <textarea
              readOnly
              value={reveal.token}
              onFocus={(e) => e.currentTarget.select()}
              rows={2}
              className="token-reveal__value"
            />
            <button onClick={copyReveal} className="primary" disabled={busy === "create"}>
              <Copy size={14} aria-hidden />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <button className="link" onClick={() => setReveal(null)}>
            Dismiss
          </button>
        </section>
      )}

      <form className="token-create" onSubmit={onCreate}>
        <header>
          <strong>Mint a new token</strong>
          <p className="muted">
            Use <code>mcp</code> for the Model Context Protocol server (Claude
            Desktop, Cursor). Use <code>cli</code> if you'd rather paste a
            token into the CLI instead of running the browser login.
          </p>
        </header>
        <div className="token-create__row">
          <input
            type="text"
            placeholder="e.g. Claude Desktop · work laptop"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={100}
            disabled={busy === "create"}
            aria-label="Token name"
          />
          <select
            value={draftScope}
            onChange={(e) => setDraftScope(e.target.value as PersonalAccessTokenScope)}
            disabled={busy === "create"}
            aria-label="Token scope"
          >
            <option value="mcp">mcp</option>
            <option value="cli">cli</option>
          </select>
          <button
            type="submit"
            className="primary"
            disabled={busy === "create" || draftName.trim().length === 0}
          >
            Mint
          </button>
        </div>
      </form>

      <section className="token-list">
        <header>
          <strong>Active tokens</strong>
          <span className="muted">{tokens.length}</span>
        </header>
        {tokens.length === 0 ? (
          <p className="muted">No tokens yet. Mint one above to get started.</p>
        ) : (
          <ul>
            {tokens.map((t) => (
              <li key={t.id} className="token-row">
                <div className="token-row__main">
                  <div className="token-row__name">
                    <span className="badge">{t.scope}</span>
                    <span>{t.name}</span>
                  </div>
                  <div className="token-row__meta muted">
                    Created {formatDate(t.createdAt)}
                    {t.lastUsedAt
                      ? ` · last used ${formatRelative(t.lastUsedAt)}`
                      : " · never used"}
                  </div>
                </div>
                <button
                  className="nk-iconbtn"
                  onClick={() => onRevoke(t.id)}
                  disabled={busy === `revoke:${t.id}`}
                  title="Revoke token"
                  aria-label="Revoke token"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (Number.isNaN(diffMs)) return iso;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
