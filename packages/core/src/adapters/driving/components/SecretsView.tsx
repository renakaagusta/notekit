import {
  ChevronRight,
  ChevronsDownUp,
  Folder,
  FolderPlus,
  KeyRound,
  MoreHorizontal,
  MoveRight,
  Pencil,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  listAllSecrets,
  listSecretVaults,
  readCachedSecretsView,
  cacheSecretsView,
  createSecretVault,
  deleteSecretVault,
  renameSecretVault,
  moveSecret,
  setSecret,
  removeSecret,
  migrateFromBlob,
  DEFAULT_VAULT_SLUG,
  DEFAULT_VAULT_LABEL,
  type SecretRef,
  type SecretVaultRecord,
} from "../../../lib/secrets-vault";
import { useCryptoStore } from "../stores/cryptoStore";
import { useLayoutStore, tabKey, findLeaf } from "../stores/layoutStore";

/** Synthetic record used to render the Default bucket alongside named vaults. */
const DEFAULT_VAULT: SecretVaultRecord = {
  slug: DEFAULT_VAULT_SLUG,
  label: DEFAULT_VAULT_LABEL,
  createdAt: "",
};

/** Generate a URL-safe slug from a free-text label. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

/**
 * The Secrets sidebar list — a folder tree of vaults and their secrets,
 * mirroring the Notes tree. Clicking a secret opens it as a tab in the active
 * pane (the detail lives in SecretDetail); vault CRUD and adding secrets happen
 * inline here.
 */
// eslint-disable-next-line max-lines-per-function -- secrets tree manages vault CRUD, add form, collapse, and per-row menus
export function SecretsView({
  mobileShell: _mobileShell = false,
  onOpened,
}: {
  mobileShell?: boolean;
  onOpened?: () => void;
}) {
  const phase = useCryptoStore((s) => s.phase);
  const device = useCryptoStore((s) => s.device);

  const [vaults, setVaults] = useState<SecretVaultRecord[]>([]);
  const [allSecrets, setAllSecrets] = useState<SecretRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrated, setMigrated] = useState(false);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Slug of the vault the add form is targeting; null when no form is open.
  const [addVault, setAddVault] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addValue, setAddValue] = useState("");
  // `vault:<slug>` or `secret:<vault>\x00<name>` — whichever 3-dot menu is open.
  const [menuKey, setMenuKey] = useState<string | null>(null);

  // Highlight the secret whose tab is active in the focused pane.
  const activeSecretKey = useLayoutStore((s) => {
    const leaf = findLeaf(s.layout, s.activePaneId);
    const t = leaf?.activeTab;
    return t && t.type === "secret" ? tabKey(t) : null;
  });

  const rowKey = (ref: SecretRef) => `${ref.vault} ${ref.name}`;

  const allVaultOptions: SecretVaultRecord[] = useMemo(
    () => [DEFAULT_VAULT, ...vaults],
    [vaults],
  );

  function secretsIn(slug: string): SecretRef[] {
    return allSecrets
      .filter((r) => r.vault === slug)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function refresh() {
    if (!device || phase !== "ready") return;
    // Cache-then-network (stale-while-revalidate): paint the last-known list
    // instantly — offline-capable — then revalidate over the network and swap +
    // re-cache. The payload is plaintext metadata only (labels + names), never
    // secret values.
    let painted = false;
    try {
      const cached = await readCachedSecretsView();
      if (cached) {
        setVaults(cached.vaults);
        setAllSecrets(cached.secrets);
        painted = true;
      }
    } catch {
      /* cache is best-effort */
    }
    try {
      if (!migrated) {
        await migrateFromBlob(device);
        setMigrated(true);
      }
      const [vaultList, secretList] = await Promise.all([
        listSecretVaults(),
        listAllSecrets(),
      ]);
      setVaults(vaultList);
      setAllSecrets(secretList);
      void cacheSecretsView({ vaults: vaultList, secrets: secretList });
    } catch (e) {
      // Offline / fetch failed — keep the cached paint if we have one; only
      // surface the error when there's nothing on screen.
      if (!painted) setError((e as Error).message);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh syncs vault/secret lists from external storage on mount and device change
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [device, phase]);

  // Refetch when another surface (the secret tab detail) mutates secrets.
  useEffect(() => {
    function onChanged() {
      void refresh();
    }
    window.addEventListener("notekit:secrets-changed", onChanged);
    return () => window.removeEventListener("notekit:secrets-changed", onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [device, phase, migrated]);

  // Close any open 3-dot menu on an outside click.
  useEffect(() => {
    if (menuKey === null) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Element | null;
      if (t?.closest(".nk-tree-ctx-wrap")) return;
      setMenuKey(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuKey]);

  function toggle(slug: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const allCollapsed = useMemo(() => {
    const slugs = allVaultOptions.map((v) => v.slug);
    return slugs.length > 0 && slugs.every((s) => collapsed.has(s));
  }, [allVaultOptions, collapsed]);

  function collapseAll() {
    setCollapsed(new Set(allVaultOptions.map((v) => v.slug)));
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  function beginAdd(slug: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      next.delete(slug);
      return next;
    });
    setAddVault(slug);
    setAddName("");
    setAddValue("");
    setMenuKey(null);
  }

  function cancelAdd() {
    setAddVault(null);
    setAddName("");
    setAddValue("");
  }

  function openSecret(ref: SecretRef) {
    useLayoutStore.getState().openTab({ type: "secret", vault: ref.vault, name: ref.name });
    onOpened?.();
  }

  function openVault(v: SecretVaultRecord) {
    useLayoutStore.getState().openTab({ type: "vault", slug: v.slug, label: v.label });
    onOpened?.();
  }

  async function onAdd() {
    if (!device || addVault === null) return;
    const name = addName.trim();
    const val = addValue.trim();
    if (!name || !val) return;
    setBusy(true);
    setError(null);
    try {
      await setSecret(name, val, device, addVault);
      const vault = addVault;
      cancelAdd();
      await refresh();
      openSecret({ vault, name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveSecret(ref: SecretRef) {
    if (!device) return;
    setMenuKey(null);
    if (!confirm(`Remove secret "${ref.name}" from the vault?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeSecret(ref.name, device, ref.vault);
      const tab = { type: "secret" as const, vault: ref.vault, name: ref.name };
      const { layout, activePaneId } = useLayoutStore.getState();
      const leaf = findLeaf(layout, activePaneId);
      if (leaf?.activeTab && tabKey(leaf.activeTab) === tabKey(tab)) {
        useLayoutStore.getState().closeTab(tab, activePaneId);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onMoveSecret(ref: SecretRef, target: string) {
    if (!device || target === ref.vault) return;
    setMenuKey(null);
    setBusy(true);
    setError(null);
    try {
      await moveSecret(ref.name, ref.vault, target, device);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateVault() {
    const label = window.prompt("New vault name (e.g. Work):");
    if (!label) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    const slug = slugify(trimmed);
    setError(null);
    if (!slug) {
      setError("Use at least one letter or digit for the vault name.");
      return;
    }
    if (vaults.some((v) => v.slug === slug)) {
      setError(`A vault with the slug "${slug}" already exists.`);
      return;
    }
    setBusy(true);
    try {
      await createSecretVault(slug, trimmed);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteVault(slug: string) {
    setMenuKey(null);
    if (slug === DEFAULT_VAULT_SLUG) return;
    const rec = vaults.find((v) => v.slug === slug);
    const count = allSecrets.filter((s) => s.vault === slug).length;
    const label = rec?.label ?? slug;
    const msg = count
      ? `Delete vault "${label}" and remove ${count} secret(s) inside it? This cannot be undone.`
      : `Delete vault "${label}"?`;
    if (!confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSecretVault(slug, { force: count > 0 });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRenameVault(slug: string) {
    setMenuKey(null);
    if (slug === DEFAULT_VAULT_SLUG) return;
    const rec = vaults.find((v) => v.slug === slug);
    const next = prompt("Rename vault to:", rec?.label ?? "");
    if (!next || next.trim() === rec?.label) return;
    setBusy(true);
    setError(null);
    try {
      await renameSecretVault(slug, next.trim());
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (phase !== "ready") {
    return (
      <div className="nk-empty">
        <p>{phaseCopy(phase)}</p>
      </div>
    );
  }

  const totalSecrets = allSecrets.length;
  const showEmpty = totalSecrets === 0 && vaults.length === 0 && addVault === null;

  return (
    <>
      <div className="nk-tree-toolbar">
        <button
          className="nk-tree-tb-btn"
          title="New secret"
          aria-label="New secret"
          onClick={() => beginAdd(DEFAULT_VAULT_SLUG)}
          disabled={busy}
        >
          <Plus size={14} aria-hidden />
        </button>
        <button
          className="nk-tree-tb-btn"
          title="New vault"
          aria-label="New vault"
          onClick={() => void onCreateVault()}
          disabled={busy}
        >
          <FolderPlus size={14} aria-hidden />
        </button>
        <button
          className="nk-tree-tb-btn"
          title={allCollapsed ? "Expand all" : "Collapse all"}
          aria-label={allCollapsed ? "Expand all" : "Collapse all"}
          onClick={allCollapsed ? expandAll : collapseAll}
        >
          <ChevronsDownUp size={14} aria-hidden />
        </button>
      </div>

      {error && (
        <div className="nk-error-text" style={{ padding: "0 var(--gap-3)" }}>
          {error}
        </div>
      )}

      {showEmpty ? (
        <div className="nk-empty nk-empty--center">
          <Shield
            size={36}
            aria-hidden
            style={{ color: "var(--muted)", opacity: 0.4, marginBottom: 14 }}
          />
          <p>No secrets yet.</p>
          <p className="nk-empty-hint">
            API keys and tokens, encrypted on-device before they touch the vault.
          </p>
          <div className="nk-empty-cta-row">
            <button
              className="nk-empty-cta"
              onClick={() => beginAdd(DEFAULT_VAULT_SLUG)}
              disabled={busy}
            >
              <Plus size={14} aria-hidden /> Add secret
            </button>
          </div>
        </div>
      ) : (
        <ul className="nk-tree">
          {/* eslint-disable-next-line max-lines-per-function -- renders a vault folder row, its add form, and secret rows with per-row menus */}
          {allVaultOptions.map((v) => {
            const isCollapsed = collapsed.has(v.slug);
            const secrets = secretsIn(v.slug);
            const vaultMenu = `vault:${v.slug}`;
            return (
              <li key={v.slug || "__default__"} className="nk-tree-group">
                <div
                  className="nk-tree-item nk-tree-item--folder"
                  style={{ paddingLeft: 8 }}
                  onClick={() => openVault(v)}
                >
                  <span
                    className={"nk-disclosure" + (isCollapsed ? "" : " open")}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(v.slug);
                    }}
                    aria-hidden
                  >
                    <ChevronRight size={12} />
                  </span>
                  <Folder size={14} className="nk-tree-icon" aria-hidden />
                  <span className="nk-tree-label">{v.label}</span>
                  <span className="nk-tree-count">{secrets.length}</span>
                  <span className="nk-tree-ctx-wrap">
                    <button
                      className="nk-tree-ctx-btn"
                      title="Add secret here"
                      aria-label="Add secret here"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginAdd(v.slug);
                      }}
                    >
                      <Plus size={13} aria-hidden />
                    </button>
                    {v.slug !== DEFAULT_VAULT_SLUG && (
                      <button
                        className="nk-tree-ctx-btn"
                        title="More options"
                        aria-label="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuKey((cur) => (cur === vaultMenu ? null : vaultMenu));
                        }}
                      >
                        <MoreHorizontal size={13} aria-hidden />
                      </button>
                    )}
                    {menuKey === vaultMenu && (
                      <ul className="nk-ctx-menu" role="menu">
                        <li role="none">
                          <button
                            role="menuitem"
                            className="nk-ctx-menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onRenameVault(v.slug);
                            }}
                          >
                            <Pencil size={13} aria-hidden /> Rename
                          </button>
                        </li>
                        <li role="none">
                          <button
                            role="menuitem"
                            className="nk-ctx-menu-item nk-ctx-menu-item--danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDeleteVault(v.slug);
                            }}
                          >
                            <Trash2 size={13} aria-hidden /> Delete vault
                          </button>
                        </li>
                      </ul>
                    )}
                  </span>
                </div>

                {!isCollapsed && (
                  <ul className="nk-tree-sublist">
                    {addVault === v.slug && (
                      <li className="nk-tree-secret--form">
                        <input
                          className="nk-input"
                          placeholder="Secret name (e.g. OPENAI_KEY)"
                          autoFocus
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelAdd();
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
                            if (e.key === "Escape") cancelAdd();
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
                          <button className="nk-btn" onClick={cancelAdd} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      </li>
                    )}
                    {secrets.length === 0 && addVault !== v.slug && (
                      <li className="nk-tree-secret-empty">No secrets in {v.label}.</li>
                    )}
                    {secrets.map((ref) => {
                      const secretMenu = `secret:${rowKey(ref)}`;
                      const active =
                        activeSecretKey === tabKey({ type: "secret", vault: ref.vault, name: ref.name });
                      return (
                        <li
                          key={rowKey(ref)}
                          className={
                            "nk-tree-item nk-tree-item--note nk-tree-secret" +
                            (active ? " active" : "")
                          }
                          onClick={() => openSecret(ref)}
                        >
                          <span className="nk-guide" style={{ left: 15 }} aria-hidden />
                          <KeyRound size={14} className="nk-tree-icon" aria-hidden />
                          <span className="nk-tree-label">{ref.name}</span>
                          <span className="nk-tree-ctx-wrap">
                            <button
                              className="nk-tree-ctx-btn"
                              title="More options"
                              aria-label="More options"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuKey((cur) => (cur === secretMenu ? null : secretMenu));
                              }}
                            >
                              <MoreHorizontal size={13} aria-hidden />
                            </button>
                            {menuKey === secretMenu && (
                              <ul className="nk-ctx-menu" role="menu">
                                {allVaultOptions
                                  .filter((opt) => opt.slug !== ref.vault)
                                  .map((opt) => (
                                    <li key={opt.slug || "__default__"} role="none">
                                      <button
                                        role="menuitem"
                                        className="nk-ctx-menu-item"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void onMoveSecret(ref, opt.slug);
                                        }}
                                      >
                                        <MoveRight size={13} aria-hidden /> Move to {opt.label}
                                      </button>
                                    </li>
                                  ))}
                                <li role="none">
                                  <button
                                    role="menuitem"
                                    className="nk-ctx-menu-item nk-ctx-menu-item--danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void onRemoveSecret(ref);
                                    }}
                                  >
                                    <Trash2 size={13} aria-hidden /> Delete secret
                                  </button>
                                </li>
                              </ul>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
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
