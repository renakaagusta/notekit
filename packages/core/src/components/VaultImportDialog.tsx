import { useState } from "react";
import * as vaultApi from "../lib/vault-api";
import type { VaultImportResult, VaultRef } from "../lib/vault-api";
import { pull as syncPull } from "../lib/sync";

interface VaultImportDialogProps {
  /** Vault that will receive the imported files. */
  dest: VaultRef;
  /** Every vault the user has registered. The dialog hides `dest` from the source list. */
  vaults: VaultRef[];
  onClose(): void;
  /** Called after a successful import (refresh local stores etc.). */
  onImported?(result: VaultImportResult): void;
}

type Phase = "pick" | "running" | "done" | "error";

export function VaultImportDialog({
  dest,
  vaults,
  onClose,
  onImported,
}: VaultImportDialogProps) {
  const sourceCandidates = vaults.filter((v) => v.id && v.id !== dest.id);
  const [sourceId, setSourceId] = useState<string>(
    sourceCandidates[0]?.id ?? "",
  );
  const [phase, setPhase] = useState<Phase>("pick");
  const [result, setResult] = useState<VaultImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!dest.id || !sourceId) return;
    setPhase("running");
    setError(null);
    try {
      const r = await vaultApi.importFromVault(dest.id, sourceId);
      setResult(r);
      setPhase("done");
      // Imported files are committed to the dest repo — re-pull so the
      // in-memory stores pick them up. Safe even if zero were imported.
      await syncPull();
      onImported?.(r);
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const sourceVault = sourceCandidates.find((v) => v.id === sourceId);

  return (
    <div className="nk-modal-backdrop" onClick={phase === "running" ? undefined : onClose}>
      <div className="nk-modal" onClick={(e) => e.stopPropagation()}>
        <header className="nk-modal-hd">
          <h2>Import into this vault</h2>
          <p className="nk-modal-sub">
            Copies <code>notes/</code>, <code>tickets/</code>, <code>journal/</code>,
            and <code>attachments/</code> from another vault into{" "}
            <b>{dest.label || `${dest.owner}/${dest.repo}`}</b>. Files already
            present at the same path are skipped — nothing is ever overwritten.
          </p>
        </header>
        <button
          className="nk-modal-close nk-iconbtn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          disabled={phase === "running"}
        >
          ×
        </button>

        {error && <div className="nk-modal-error">{error}</div>}

        {phase === "pick" && (
          <div className="nk-modal-body">
            {sourceCandidates.length === 0 ? (
              <p className="nk-empty-hint">
                You need at least one other vault to import from.
              </p>
            ) : (
              <>
                <label className="nk-field">
                  <span>Source vault</span>
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    {sourceCandidates.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label || `${v.owner}/${v.repo}`}
                      </option>
                    ))}
                  </select>
                  {sourceVault && (
                    <span className="nk-field-hint">
                      {sourceVault.owner}/{sourceVault.repo}
                      {sourceVault.branch && sourceVault.branch !== "main"
                        ? ` · ${sourceVault.branch}`
                        : ""}
                    </span>
                  )}
                </label>

                <div className="nk-modal-actions">
                  <button
                    className="nk-vault-rename-cancel"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    className="nk-signin-btn"
                    onClick={run}
                    disabled={!sourceId}
                    style={{ maxWidth: 200 }}
                  >
                    Import
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {phase === "running" && (
          <div className="nk-modal-body">
            <p>Importing… this can take a minute on a large vault.</p>
            <p className="nk-empty-hint">
              Each file is read from the source repo and committed to the
              destination repo via the GitHub Contents API.
            </p>
          </div>
        )}

        {phase === "done" && result && (
          <div className="nk-modal-body">
            <div className="nk-import-summary">
              <div>
                <b>{result.imported}</b> imported
              </div>
              <div>
                <b>{result.skipped}</b> skipped (already present)
              </div>
              <div className={result.errors.length > 0 ? "nk-import-err" : ""}>
                <b>{result.errors.length}</b> error
                {result.errors.length === 1 ? "" : "s"}
              </div>
            </div>
            {result.errors.length > 0 && (
              <details className="nk-import-errors">
                <summary>Show error details</summary>
                <ul>
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      <code>{e.path}</code> — {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="nk-modal-actions">
              <button
                className="nk-signin-btn"
                onClick={onClose}
                style={{ maxWidth: 160 }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
