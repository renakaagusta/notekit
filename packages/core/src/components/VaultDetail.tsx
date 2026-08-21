import { ChevronRight, KeyRound, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { listAllSecrets, type SecretRef } from "../lib/secrets-vault";
import { useLayoutStore } from "../stores/layoutStore";

/**
 * The contents of a secret vault rendered as a pane tab: every secret in the
 * vault as a row that opens its own secret tab. Refetches when secrets change
 * elsewhere (add / delete / move all broadcast `notekit:secrets-changed`).
 */
export function VaultDetail({
  slug,
  label,
  paneId,
}: {
  slug: string;
  label: string;
  paneId: string;
}) {
  const [secrets, setSecrets] = useState<SecretRef[]>([]);

  useEffect(() => {
    let alive = true;
    function load() {
      listAllSecrets()
        .then((all) => {
          if (alive) setSecrets(all.filter((s) => s.vault === slug));
        })
        .catch(() => { /* non-fatal */ });
    }
    load();
    window.addEventListener("notekit:secrets-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("notekit:secrets-changed", load);
    };
  }, [slug]);

  const sorted = [...secrets].sort((a, b) => a.name.localeCompare(b.name));

  function openSecret(ref: SecretRef) {
    useLayoutStore.getState().openTab({ type: "secret", vault: ref.vault, name: ref.name }, paneId);
  }

  return (
    <div className="nk-tab-detail nk-folder-detail nk-tab-detail--fill">
      <div className="nk-tab-detail-header">
        <span className="nk-tab-detail-type">
          <Shield size={13} aria-hidden /> Vault
        </span>
      </div>
      <h1 className="nk-tab-detail-title">{label}</h1>
      <p className="nk-tab-detail-desc" style={{ fontSize: 12, color: "var(--muted)" }}>
        {sorted.length === 0
          ? "No secrets in this vault"
          : `${sorted.length} secret${sorted.length === 1 ? "" : "s"} · encrypted on-device`}
      </p>

      <ul className="nk-index-list">
        {sorted.map((ref) => (
          <li key={ref.name}>
            <button className="nk-index-row" onClick={() => openSecret(ref)}>
              <KeyRound size={15} className="nk-index-icon" aria-hidden />
              <span className="nk-index-label" style={{ fontFamily: "var(--mono-font)" }}>
                {ref.name}
              </span>
              <ChevronRight size={14} className="nk-index-chevron" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
