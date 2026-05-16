import { useEffect, useState } from "react";
import { useCryptoStore } from "../stores/cryptoStore";
import {
  listSecretNames,
  setSecret,
  removeSecret,
  listDevices,
  removeDevice,
  type DeviceRecord,
} from "../lib/secrets-vault";
import { askAI, type AIProvider } from "../lib/ai-client";
import { VaultApproveDevice } from "./VaultPairing";

const KNOWN_PROVIDERS: { id: AIProvider; label: string; placeholder: string }[] = [
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
];

export function AIVaultPanel() {
  const phase = useCryptoStore((s) => s.phase);
  const device = useCryptoStore((s) => s.device);

  const [names, setNames] = useState<string[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<Record<string, string>>({});
  const [showApprove, setShowApprove] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [answer, setAnswer] = useState<string>("");
  const [asking, setAsking] = useState(false);

  async function refresh() {
    if (!device || phase !== "ready") return;
    setBusy(true);
    try {
      const [secretNames, deviceList] = await Promise.all([
        listSecretNames(device),
        listDevices(),
      ]);
      setNames(secretNames);
      setDevices(deviceList);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, phase]);

  async function onSave(provider: AIProvider) {
    const value = draftValue[provider]?.trim();
    if (!value || !device) return;
    setBusy(true);
    setError(null);
    try {
      await setSecret(provider, value, device);
      setDraftValue((d) => ({ ...d, [provider]: "" }));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(name: string) {
    if (!device) return;
    if (!window.confirm(`Remove "${name}" from the vault?`)) return;
    setBusy(true);
    try {
      await removeSecret(name, device);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeDevice(deviceId: string, name: string) {
    if (!device) return;
    if (deviceId === device.deviceId) {
      window.alert("Use another device to revoke this one.");
      return;
    }
    if (
      !window.confirm(
        `Revoke "${name}"? It loses access immediately. Rotate any stored API keys afterwards.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await removeDevice(deviceId, device);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAsk() {
    if (!device || !prompt.trim()) return;
    setAsking(true);
    setAnswer("");
    setError(null);
    try {
      const reply = await askAI(provider, prompt.trim(), device);
      setAnswer(reply);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  if (phase !== "ready") {
    return (
      <div className="nk-side-panel nk-ai-panel">
        <header className="nk-ai-panel-hd">
          <h2>AI</h2>
        </header>
        <div className="nk-empty">
          <p>{phaseCopy(phase)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nk-side-panel nk-ai-panel">
      <header className="nk-ai-panel-hd">
        <h2>AI</h2>
      </header>

      {error && <div className="nk-error-text nk-ai-error">{error}</div>}

      <section className="nk-ai-section">
        <h3>Keys</h3>
        {KNOWN_PROVIDERS.map((p) => {
          const has = names.includes(p.id);
          return (
            <div key={p.id} className="nk-ai-keyrow">
              <div className="nk-ai-keyrow-hd">
                <strong>{p.label}</strong>
                {has && <span className="nk-pill">stored</span>}
              </div>
              <div className="nk-ai-keyrow-input">
                <input
                  className="nk-input"
                  type="password"
                  autoComplete="off"
                  placeholder={has ? "Replace key…" : p.placeholder}
                  value={draftValue[p.id] ?? ""}
                  onChange={(e) =>
                    setDraftValue((d) => ({ ...d, [p.id]: e.target.value }))
                  }
                  disabled={busy}
                />
                <button
                  className="nk-btn nk-btn--primary"
                  onClick={() => onSave(p.id)}
                  disabled={busy || !draftValue[p.id]?.trim()}
                >
                  {has ? "Rotate" : "Save"}
                </button>
                {has && (
                  <button
                    className="nk-btn"
                    onClick={() => onRemove(p.id)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="nk-ai-section">
        <h3>Ask AI</h3>
        <select
          className="nk-input"
          value={provider}
          onChange={(e) => setProvider(e.target.value as AIProvider)}
        >
          {KNOWN_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id} disabled={!names.includes(p.id)}>
              {p.label}
              {names.includes(p.id) ? "" : " (no key)"}
            </option>
          ))}
        </select>
        <textarea
          className="nk-textarea"
          rows={3}
          placeholder="Ask anything…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          className="nk-btn nk-btn--primary"
          onClick={onAsk}
          disabled={asking || !prompt.trim() || !names.includes(provider)}
        >
          {asking ? "Thinking…" : "Ask"}
        </button>
        {answer && (
          <pre className="nk-ai-answer">{answer}</pre>
        )}
      </section>

      <section className="nk-ai-section">
        <header className="nk-ai-section-hd">
          <h3>Devices</h3>
          <button
            className="nk-btn"
            onClick={() => setShowApprove(true)}
          >
            Pair new device
          </button>
        </header>
        <ul className="nk-device-list">
          {devices.map((d) => (
            <li key={d.deviceId} className="nk-device-item">
              <div>
                <strong>{d.name}</strong>
                {d.deviceId === device?.deviceId && (
                  <span className="nk-pill">this device</span>
                )}
                <div className="nk-muted">
                  Added {new Date(d.addedAt).toLocaleDateString()}
                </div>
              </div>
              {d.deviceId !== device?.deviceId && (
                <button
                  className="nk-btn nk-btn--danger"
                  onClick={() => onRevokeDevice(d.deviceId, d.name)}
                  disabled={busy}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {showApprove && (
        <VaultApproveDevice onClose={() => setShowApprove(false)} />
      )}
    </div>
  );
}

function phaseCopy(phase: string): string {
  switch (phase) {
    case "idle":
      return "Connect a Git vault to enable encrypted AI keys.";
    case "checking":
      return "Checking vault…";
    case "needs-setup":
      return "Set up the encrypted vault to use AI features.";
    case "needs-pair":
      return "This device isn't paired yet.";
    case "waiting-approval":
      return "Waiting for approval from your other device…";
    case "error":
      return "Vault error.";
    default:
      return "Loading…";
  }
}
