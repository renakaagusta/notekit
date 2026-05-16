import { useEffect, useState } from "react";
import * as vaultApi from "../lib/vault-api";
import type { VaultRef, VaultSettings } from "../lib/vault-api";

interface VaultSettingsDialogProps {
  vault: VaultRef;
  onClose(): void;
  /** Called after a successful save. Receives the updated settings. */
  onSaved?(settings: VaultSettings): void;
}

const THEMES: { value: VaultSettings["theme"]; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Follows the OS preference." },
  { value: "light", label: "Light", hint: "Forces light mode for this vault." },
  { value: "dark", label: "Dark", hint: "Forces dark mode for this vault." },
];

export function VaultSettingsDialog({
  vault,
  onClose,
  onSaved,
}: VaultSettingsDialogProps) {
  const [settings, setSettings] = useState<VaultSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vault.id) return;
    let cancelled = false;
    setError(null);
    vaultApi
      .getVaultSettings(vault.id)
      .then((r) => {
        if (!cancelled) setSettings(r.settings);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [vault.id]);

  async function save() {
    if (!vault.id || !settings) return;
    setBusy(true);
    setError(null);
    try {
      const res = await vaultApi.patchVaultSettings(vault.id, settings);
      setSettings(res.settings);
      onSaved?.(res.settings);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nk-modal-backdrop" onClick={onClose}>
      <div className="nk-modal" onClick={(e) => e.stopPropagation()}>
        <header className="nk-modal-hd">
          <h2>Vault settings</h2>
          <p className="nk-modal-sub">
            {vault.label || `${vault.owner}/${vault.repo}`}
          </p>
        </header>
        <button
          className="nk-modal-close nk-iconbtn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>

        {error && <div className="nk-modal-error">{error}</div>}
        {!settings && !error && (
          <div className="nk-modal-body">
            <p className="nk-empty-hint">Loading…</p>
          </div>
        )}

        {settings && (
          <div className="nk-modal-body">
            <fieldset className="nk-field-group">
              <legend>Theme</legend>
              <div className="nk-radio-group">
                {THEMES.map((t) => (
                  <label key={t.value} className="nk-radio">
                    <input
                      type="radio"
                      name="theme"
                      value={t.value}
                      checked={settings.theme === t.value}
                      onChange={() =>
                        setSettings({ ...settings, theme: t.value })
                      }
                      disabled={busy}
                    />
                    <span>
                      <b>{t.label}</b>
                      <span className="nk-radio-hint">{t.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="nk-field">
              <span>Default folder for new notes</span>
              <input
                type="text"
                value={settings.defaultFolder ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultFolder: e.target.value.trim() || null,
                  })
                }
                placeholder="(root)"
                disabled={busy}
              />
              <span className="nk-field-hint">
                New notes drop into this folder. Leave blank to use the vault root.
              </span>
            </label>

            <label className="nk-field">
              <span>Default agent slug</span>
              <input
                type="text"
                value={settings.defaultAgentSlug ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultAgentSlug: e.target.value.trim() || null,
                  })
                }
                placeholder="(none — commit as you)"
                disabled={busy}
              />
              <span className="nk-field-hint">
                Agent-authored commits for this vault. Saved now; applied to the
                AI commit flow when the panel is wired.
              </span>
            </label>

            <div className="nk-modal-actions">
              <button
                className="nk-vault-rename-cancel"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="nk-signin-btn"
                onClick={save}
                disabled={busy}
                style={{ maxWidth: 160 }}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
