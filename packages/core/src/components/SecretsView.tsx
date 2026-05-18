import { useEffect, useState } from "react";
import { ArrowLeft, History, Pencil, X } from "lucide-react";
import { useCryptoStore } from "../stores/cryptoStore";
import {
  listSecretNames,
  getSecret,
  setSecret,
  removeSecret,
  restoreSecret,
  migrateFromBlob,
  SECRETS_PREFIX,
} from "../lib/secrets-vault";
import { HistoryView } from "./HistoryView";

interface SecretRow {
  name: string;
  revealed: string | null;
}

export function SecretsView() {
  const phase = useCryptoStore((s) => s.phase);
  const device = useCryptoStore((s) => s.device);

  const [rows, setRows] = useState<SecretRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrated, setMigrated] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addValue, setAddValue] = useState("");

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [historySecret, setHistorySecret] = useState<string | null>(null);

  async function refresh() {
    if (!device || phase !== "ready") return;
    try {
      // Run migration once if legacy blob exists
      if (!migrated) {
        await migrateFromBlob(device);
        setMigrated(true);
      }
      const names = await listSecretNames();
      setRows(names.map((n) => ({ name: n, revealed: null })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, phase]);

  async function onReveal(name: string) {
    if (!device) return;
    setBusy(true);
    try {
      const val = await getSecret(name, device);
      setRows((r) =>
        r.map((row) => (row.name === name ? { ...row, revealed: val } : row)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: SecretRow) {
    setEditingName(row.name);
    setEditValue(row.revealed ?? "");
  }

  async function onSaveEdit() {
    if (!device || !editingName) return;
    const val = editValue.trim();
    if (!val) return;
    setBusy(true);
    setError(null);
    try {
      await setSecret(editingName, val, device);
      setEditingName(null);
      setEditValue("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAdd() {
    if (!device) return;
    const name = addName.trim();
    const val = addValue.trim();
    if (!name || !val) return;
    setBusy(true);
    setError(null);
    try {
      await setSecret(name, val, device);
      setAdding(false);
      setAddName("");
      setAddValue("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(name: string) {
    if (!device) return;
    if (!confirm(`Remove secret "${name}" from the vault?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeSecret(name, device);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (phase !== "ready") {
    return (
      <div className="nk-secrets-panel">
        <header className="nk-secrets-hd">
          <h2>Secrets</h2>
        </header>
        <div className="nk-empty">
          <p>{phaseCopy(phase)}</p>
        </div>
      </div>
    );
  }

  if (historySecret !== null) {
    return (
      <div className="nk-secrets-panel">
        <header className="nk-secrets-hd">
          <button
            className="nk-iconbtn"
            onClick={() => setHistorySecret(null)}
            title="Back to secrets"
            aria-label="Back"
          >
            <ArrowLeft size={15} aria-hidden />
          </button>
          <code className="nk-secret-name">{historySecret}</code>
        </header>
        <HistoryView
          notePath={`${SECRETS_PREFIX}${historySecret}.age`}
          compact
          onRestore={device
            ? (sha) => restoreSecret(historySecret, sha, device)
            : undefined}
        />
      </div>
    );
  }

  return (
    <div className="nk-secrets-panel">
      <header className="nk-secrets-hd">
        <h2>Secrets</h2>
        <span className="nk-muted">encrypted in vault</span>
        {!adding && (
          <button
            className="nk-btn nk-btn--primary"
            onClick={() => setAdding(true)}
            disabled={busy}
          >
            Add
          </button>
        )}
      </header>

      {error && (
        <div className="nk-error-text" style={{ padding: "0 var(--gap-3)" }}>
          {error}
        </div>
      )}

      {adding && (
        <div className="nk-secret-form">
          <input
            className="nk-input"
            placeholder="Secret name (e.g. OPENAI_KEY)"
            autoFocus
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAdding(false);
                setAddName("");
                setAddValue("");
              }
            }}
            disabled={busy}
          />
          <input
            className="nk-input"
            type="password"
            autoComplete="new-password"
            placeholder="Value"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setAddName("");
                setAddValue("");
              }
            }}
            disabled={busy}
          />
          <div style={{ display: "flex", gap: "var(--gap-2)" }}>
            <button
              className="nk-btn nk-btn--primary"
              onClick={onAdd}
              disabled={busy || !addName.trim() || !addValue.trim()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              className="nk-btn"
              onClick={() => {
                setAdding(false);
                setAddName("");
                setAddValue("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding && (
        <div className="nk-empty" style={{ padding: "var(--gap-5) var(--gap-3)" }}>
          <p>No secrets yet. Add one above.</p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="nk-secret-list">
          {rows.map((row) =>
            editingName === row.name ? (
              <li key={row.name} className="nk-secret-item nk-secret-item--editing">
                <div className="nk-secret-name">{row.name}</div>
                <input
                  className="nk-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="New value"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onSaveEdit();
                    if (e.key === "Escape") {
                      setEditingName(null);
                      setEditValue("");
                    }
                  }}
                  disabled={busy}
                />
                <div style={{ display: "flex", gap: "var(--gap-2)" }}>
                  <button
                    className="nk-btn nk-btn--primary"
                    onClick={onSaveEdit}
                    disabled={busy || !editValue.trim()}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    className="nk-btn"
                    onClick={() => {
                      setEditingName(null);
                      setEditValue("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={row.name} className="nk-secret-item">
                <div className="nk-secret-body">
                  <code className="nk-secret-name">{row.name}</code>
                  <div className="nk-secret-value">
                    {row.revealed !== null ? (
                      <span className="nk-secret-revealed">{row.revealed}</span>
                    ) : (
                      <button
                        className="nk-secret-mask"
                        onClick={() => void onReveal(row.name)}
                        disabled={busy}
                        title="Reveal value"
                      >
                        ••••••••
                      </button>
                    )}
                  </div>
                </div>
                <div className="nk-secret-actions">
                  <button
                    className="nk-iconbtn"
                    onClick={() => setHistorySecret(row.name)}
                    title="View history"
                  >
                    <History size={13} aria-hidden />
                  </button>
                  <button
                    className="nk-iconbtn"
                    onClick={() => startEdit(row)}
                    title="Edit value"
                    disabled={busy}
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                  <button
                    className="nk-iconbtn"
                    onClick={() => void onRemove(row.name)}
                    title="Remove secret"
                    disabled={busy}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function phaseCopy(phase: string): string {
  switch (phase) {
    case "checking": return "Checking vault…";
    case "needs-setup": return "Set up the encrypted vault first.";
    case "needs-pair": return "This device isn't paired yet.";
    case "waiting-approval": return "Waiting for approval from your other device…";
    case "error": return "Vault error.";
    default: return "Loading…";
  }
}
