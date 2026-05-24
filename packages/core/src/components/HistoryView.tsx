import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { listCommits, type VaultCommit } from "../lib/vault-api";
import { SkeletonCommitList } from "./Skeleton";
import { useNotesStore } from "../stores/notesStore";

interface HistoryViewProps {
  notePath?: string;
  compact?: boolean;
  onRestore?: (commitSha: string) => Promise<void>;
}

type Scope = "note" | "vault";

export function HistoryView({ notePath, compact = false, onRestore }: HistoryViewProps) {
  const [scope, setScope] = useState<Scope>(notePath ? "note" : "vault");
  const [commits, setCommits] = useState<VaultCommit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringsha, setRestoringSha] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoredSha, setRestoredSha] = useState<string | null>(null);
  useNotesStore((s) => s.activeNoteId ? s.notes[s.activeNoteId] : null);

  useEffect(() => {
    if (!notePath && scope === "note") setScope("vault");
  }, [notePath, scope]);

  const scopePath = scope === "note" ? notePath : undefined;

  async function handleRestore(sha: string) {
    if (!onRestore) return;
    setRestoringSha(sha);
    setRestoreError(null);
    setRestoredSha(null);
    try {
      await onRestore(sha);
      setRestoredSha(sha);
    } catch (e) {
      setRestoreError((e as Error).message);
    } finally {
      setRestoringSha(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setCommits(null);
    setError(null);
    setRestoredSha(null);
    setRestoreError(null);
    (async () => {
      try {
        const res = await listCommits(scopePath, 50);
        if (!cancelled) setCommits(res.commits);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [scopePath]);

  return (
    <section className={"nk-history" + (compact ? " nk-history--compact" : "")}>
      <div className="nk-history-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={scope === "note"}
          className={scope === "note" ? "active" : ""}
          onClick={() => setScope("note")}
          disabled={!notePath}
          title={notePath ? "Commits touching the open note" : "Open a note to filter"}
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

      {scopePath && (
        <div className="nk-history-path-bar">
          <code className="nk-history-path">{scopePath}</code>
        </div>
      )}

      {error && <div className="nk-history-error">Failed to load: {error}</div>}
      {restoreError && <div className="nk-history-error">Restore failed: {restoreError}</div>}
      {restoredSha && <div className="nk-history-ok">Restored to {restoredSha.slice(0, 7)}</div>}
      {!error && commits === null && <SkeletonCommitList count={8} />}
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
          {commits.map((c, i) => (
            <li key={c.sha} className="nk-commit">
              <div className="nk-commit-graph">
                <div className="nk-commit-line nk-commit-line--top" aria-hidden={i === 0} />
                <div className="nk-commit-dot" />
                <div className="nk-commit-line nk-commit-line--bot" aria-hidden={i === commits.length - 1} />
              </div>
              <div className="nk-commit-body">
                <span className="nk-commit-msg">{firstLine(c.message)}</span>
                <span className="nk-commit-meta">
                  {c.authorAvatar ? (
                    <img
                      className="nk-commit-avatar nk-commit-avatar--inline"
                      src={c.authorAvatar}
                      alt=""
                    />
                  ) : null}
                  <span className="nk-commit-author">{c.authorLogin ?? c.authorName ?? "unknown"}</span>
                  <span className="nk-commit-sep">·</span>
                  <span className="nk-commit-time" title={c.authoredAt}>{relativeTime(c.authoredAt)}</span>
                  <span className="nk-commit-sep">·</span>
                  {c.url ? (
                    <a className="nk-commit-sha" href={c.url} target="_blank" rel="noreferrer">
                      {c.sha.slice(0, 7)}
                    </a>
                  ) : (
                    <span className="nk-commit-sha">{c.sha.slice(0, 7)}</span>
                  )}
                  {onRestore && i > 0 && (
                    <button
                      className="nk-commit-restore"
                      title={`Restore to ${c.sha.slice(0, 7)}`}
                      disabled={restoringsha === c.sha}
                      onClick={() => handleRestore(c.sha)}
                    >
                      <RotateCcw size={11} aria-hidden />
                      {restoringsha === c.sha ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </span>
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

function relativeTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
