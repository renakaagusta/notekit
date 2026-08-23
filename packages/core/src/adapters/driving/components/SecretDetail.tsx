import { Check, Copy, Eye, EyeOff, History, MoveRight, Pencil, Shield, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getSecret,
  setSecret,
  removeSecret,
  moveSecret,
  restoreSecret,
  listSecretVaults,
  SECRETS_PREFIX,
  DEFAULT_VAULT_SLUG,
  DEFAULT_VAULT_LABEL,
  type SecretVaultRecord,
} from "../../../lib/secrets-vault";
import { useCryptoStore } from "../stores/cryptoStore";
import { HistoryView } from "./HistoryView";

/** Broadcast so the Secrets sidebar tree refetches after a mutation here. */
function notifyChanged() {
  window.dispatchEvent(new CustomEvent("notekit:secrets-changed"));
}

/**
 * The full detail for a single secret, rendered inside a pane tab. Handles
 * reveal / copy / edit / move / history / delete — the parts that used to live
 * in the standalone Secrets panel now live next to the note editor.
 */
// eslint-disable-next-line complexity, max-lines-per-function -- single-secret detail: reveal, copy, edit, move, history, and delete states
export function SecretDetail({
  vault,
  name,
  onClose,
}: {
  vault: string;
  name: string;
  onClose: () => void;
}) {
  const device = useCryptoStore((s) => s.device);

  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const [moving, setMoving] = useState(false);
  const [vaults, setVaults] = useState<SecretVaultRecord[]>([]);

  const [showHistory, setShowHistory] = useState(false);

  // Reset transient state when the tab switches to a different secret.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear reveal/edit/move state when the tab points at a different secret
    setRevealed(null);
    setEditing(false);
    setEditValue("");
    setMoving(false);
    setShowHistory(false);
    setError(null);
  }, [vault, name]);

  const vaultLabel = vault
    ? vaults.find((v) => v.slug === vault)?.label ?? vault
    : DEFAULT_VAULT_LABEL;

  const path = vault
    ? `${SECRETS_PREFIX}${vault}/${name}.age`
    : `${SECRETS_PREFIX}${name}.age`;

  async function onReveal() {
    if (!device) return;
    setBusy(true);
    setError(null);
    try {
      setRevealed(await getSecret(name, device, vault));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!device) return;
    setError(null);
    try {
      const val = revealed ?? (await getSecret(name, device, vault));
      if (val === null || val === undefined) return;
      await navigator.clipboard.writeText(val);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function startEdit() {
    setError(null);
    setEditValue(revealed ?? "");
    setEditing(true);
    if (revealed === null && device) {
      try {
        const val = await getSecret(name, device, vault);
        setEditValue(val ?? "");
      } catch {
        /* leave the field blank — user can type a fresh value */
      }
    }
  }

  async function onSaveEdit() {
    if (!device) return;
    const val = editValue.trim();
    if (!val) return;
    setBusy(true);
    setError(null);
    try {
      await setSecret(name, val, device, vault);
      setRevealed(val);
      setEditing(false);
      setEditValue("");
      notifyChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function beginMove() {
    setError(null);
    if (vaults.length === 0) {
      try {
        setVaults(await listSecretVaults());
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setMoving(true);
  }

  async function onMove(target: string) {
    if (!device || target === vault) {
      setMoving(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await moveSecret(name, vault, target, device);
      setMoving(false);
      notifyChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!device) return;
    if (!confirm(`Remove secret "${name}" from the vault?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeSecret(name, device, vault);
      notifyChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Load the vault list up-front so the "Move" picker is instant.
  useEffect(() => {
    listSecretVaults().then(setVaults).catch(() => { /* non-fatal */ });
  }, []);

  const moveOptions: SecretVaultRecord[] = [
    { slug: DEFAULT_VAULT_SLUG, label: DEFAULT_VAULT_LABEL, createdAt: "" },
    ...vaults,
  ].filter((v) => v.slug !== vault);

  return (
    <div className="nk-tab-detail nk-tab-detail--fill">
      <div className="nk-tab-detail-header">
        <span className="nk-tab-detail-type">
          <Shield size={13} aria-hidden /> Secret
        </span>
      </div>
      <h1 className="nk-tab-detail-title" style={{ fontFamily: "var(--mono-font)", wordBreak: "break-all" }}>
        {name}
      </h1>
      <p className="nk-tab-detail-desc" style={{ fontSize: 12, color: "var(--muted)" }}>
        Vault: {vaultLabel} · encrypted on-device
      </p>

      {error && <div className="nk-error-text" style={{ marginTop: 8 }}>{error}</div>}

      {editing ? (
        <div className="nk-secret-detail-value">
          <input
            className="nk-input"
            type="text"
            autoComplete="off"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSaveEdit();
              if (e.key === "Escape") {
                setEditing(false);
                setEditValue("");
              }
            }}
            disabled={busy}
          />
          <div style={{ display: "flex", gap: "var(--gap-2)", marginTop: 8 }}>
            <button
              className="nk-btn nk-btn--primary"
              onClick={() => void onSaveEdit()}
              disabled={busy || !editValue.trim()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              className="nk-btn"
              onClick={() => {
                setEditing(false);
                setEditValue("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="nk-secret-detail-value">
          <code className="nk-secret-detail-code">
            {revealed !== null ? revealed : "••••••••••••••••"}
          </code>
        </div>
      )}

      {moving && (
        <div className="nk-secret-detail-value" style={{ marginTop: 8 }}>
          <select
            className="nk-input"
            autoFocus
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value === "") return;
              void onMove(e.target.value === "__default__" ? "" : e.target.value);
            }}
          >
            <option value="" disabled>Move to vault…</option>
            {moveOptions.map((v) => (
              <option key={v.slug || "__default__"} value={v.slug || "__default__"}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!editing && (
        <div className="nk-tab-detail-actions" style={{ flexWrap: "wrap" }}>
          <button
            className="nk-btn nk-btn--primary"
            onClick={() => (revealed !== null ? setRevealed(null) : void onReveal())}
            disabled={busy}
          >
            {revealed !== null ? (
              <><EyeOff size={14} aria-hidden /> Hide</>
            ) : (
              <><Eye size={14} aria-hidden /> Reveal</>
            )}
          </button>
          <button className="nk-btn" onClick={() => void onCopy()} disabled={busy}>
            {copied ? <><Check size={14} aria-hidden /> Copied</> : <><Copy size={14} aria-hidden /> Copy</>}
          </button>
          <button className="nk-btn" onClick={() => void startEdit()} disabled={busy}>
            <Pencil size={14} aria-hidden /> Edit
          </button>
          <button className="nk-btn" onClick={() => void beginMove()} disabled={busy}>
            <MoveRight size={14} aria-hidden /> Move
          </button>
          <button
            className={"nk-btn" + (showHistory ? " nk-btn--primary" : "")}
            onClick={() => setShowHistory((v) => !v)}
            disabled={busy}
          >
            <History size={14} aria-hidden /> History
          </button>
          <button className="nk-btn nk-btn--danger" onClick={() => void onDelete()} disabled={busy}>
            <Trash2 size={14} aria-hidden /> Delete
          </button>
          <button className="nk-btn" onClick={onClose} disabled={busy}>
            <X size={14} aria-hidden /> Close
          </button>
        </div>
      )}

      {showHistory && (
        <div className="nk-secret-detail-history">
          <HistoryView
            notePath={path}
            compact
            onRestore={device ? (sha) => restoreSecret(name, sha, device, vault) : undefined}
          />
        </div>
      )}
    </div>
  );
}
