import { useEffect, useState } from "react";
import { listCommits, type VaultCommit } from "../lib/vault-api";
import { useNotesStore } from "../stores/notesStore";
import { noteTitle } from "../lib/note-display";

interface HistoryViewProps {
  notePath?: string;
  compact?: boolean;
}

type Scope = "note" | "vault";

export function HistoryView({ notePath, compact = false }: HistoryViewProps) {
  const [scope, setScope] = useState<Scope>(notePath ? "note" : "vault");
  const [commits, setCommits] = useState<VaultCommit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeNote = useNotesStore((s) =>
    s.activeNoteId ? s.notes[s.activeNoteId] : null,
  );

  useEffect(() => {
    if (!notePath && scope === "note") setScope("vault");
  }, [notePath, scope]);

  const scopePath = scope === "note" ? notePath : undefined;

  useEffect(() => {
    let cancelled = false;
    setCommits(null);
    setError(null);
    (async () => {
      try {
        const res = await listCommits(scopePath, 50);
        if (!cancelled) setCommits(res.commits);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopePath]);

  const heading = scopePath
    ? activeNote
      ? `History · ${noteTitle(activeNote)}`
      : `History · ${scopePath}`
    : "Vault history";

  return (
    <section className={"nk-history" + (compact ? " nk-history--compact" : "")}>
      <div className="nk-history-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={scope === "note"}
          className={scope === "note" ? "active" : ""}
          onClick={() => setScope("note")}
          disabled={!notePath}
          title={
            notePath ? "Commits touching the open note" : "Open a note to filter"
          }
        >
          This note
        </button>
        <button
          role="tab"
          aria-selected={scope === "vault"}
          className={scope === "vault" ? "active" : ""}
          onClick={() => setScope("vault")}
        >
          All vault
        </button>
      </div>
      <header className="nk-history-hd">
        <h2>{heading}</h2>
        {scopePath && (
          <code className="nk-history-path">{scopePath}</code>
        )}
      </header>

      {error && <div className="nk-history-error">Failed to load: {error}</div>}
      {!error && commits === null && (
        <div className="nk-empty">Loading…</div>
      )}
      {commits && commits.length === 0 && (
        <div className="nk-empty">
          <p>No commits yet.</p>
          <p className="nk-empty-hint">
            {scopePath
              ? "This note hasn't been pushed to the vault."
              : "Edit a note to make your first commit."}
          </p>
        </div>
      )}

      {commits && commits.length > 0 && (
        <ol className="nk-commitlist">
          {commits.map((c) => (
            <li key={c.sha} className="nk-commit">
              <div className="nk-commit-row">
                {c.authorAvatar ? (
                  <img className="nk-commit-avatar" src={c.authorAvatar} alt="" />
                ) : (
                  <div className="nk-commit-avatar nk-commit-avatar--ph">
                    {(c.authorName ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="nk-commit-body">
                  <div className="nk-commit-msg">{firstLine(c.message)}</div>
                  <div className="nk-commit-meta">
                    {c.authorLogin ?? c.authorName ?? "unknown"}
                    {" · "}
                    {formatTime(c.authoredAt)}
                    {" · "}
                    <a
                      className="nk-commit-link"
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.sha.slice(0, 7)}
                    </a>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function firstLine(s: string): string {
  return s.split("\n")[0] ?? s;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
