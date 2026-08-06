import { useEffect, useState } from "react";
import {
  Bell,
  Bot,
  ChevronRight,
  Info,
  KeyRound,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Moon,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  TextCursorInput,
  X,
} from "lucide-react";
import { useVaultStore } from "../stores/vaultStore";
import { useNotesStore } from "../stores/notesStore";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import * as vaultApi from "../lib/vault-api";
import { listAgents, type AgentProfile } from "../lib/agents-api";
import { LOCALES, currentLocale, setLocale } from "../i18n";
import type { User } from "../types/user";

/**
 * Mobile Settings — a dedicated full-screen page with four tabs (General ·
 * Editor · AI · Account), matching Daymark's multi-tab settings but mapped to
 * NoteKit's real capabilities. Consolidates settings that were scattered across
 * the drawer's account menu (agents, devices, tokens, notifications, recovery).
 */

const APP_VERSION = "0.1.0";

type Tab = "general" | "editor" | "ai" | "account";
type ThemeChoice = "light" | "dark" | "auto";

interface MobileSettingsProps {
  user?: User | null;
  onSignOut?: () => void;
  onClose: () => void;
  onOpenAgents?: () => void;
  onOpenHistory?: () => void;
  onOpenTokens?: () => void;
  onOpenDevices?: () => void;
  onOpenNotifications?: () => void;
  vimMode?: boolean;
  onToggleVim?: () => void;
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  plus: "Plus",
  lifetime: "Lifetime",
};

export function MobileSettings({
  user,
  onSignOut,
  onClose,
  onOpenAgents,
  onOpenHistory,
  onOpenTokens,
  onOpenDevices,
  onOpenNotifications,
  vimMode,
  onToggleVim,
}: MobileSettingsProps) {
  const [tab, setTab] = useState<Tab>("general");

  const activeVaultId = useVaultStore((s) => s.activeId);
  const activeSettings = useVaultStore((s) => s.activeSettings);
  const setActiveSettings = useVaultStore((s) => s.setActiveSettings);
  const folders = useNotesStore((s) => s.folders);
  const openRecovery = useRecoveryBackupStore((s) => s.openSheet);

  const theme: ThemeChoice = activeSettings?.theme ?? "auto";
  const [locale, setLocaleState] = useState(currentLocale());
  const [agents, setAgents] = useState<AgentProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAgents()
      .then((r) => !cancelled && setAgents(r.agents))
      .catch(() => !cancelled && setAgents([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(patch: Partial<vaultApi.VaultSettings>) {
    if (!activeVaultId || !activeSettings) return;
    const next = { ...activeSettings, ...patch };
    setActiveSettings(next);
    await vaultApi.patchVaultSettings(activeVaultId, next).catch(() => {});
  }

  function pickLocale(code: string) {
    setLocale(code);
    setLocaleState(code);
  }

  const TABS: { key: Tab; label: string; Icon: typeof SettingsIcon }[] = [
    { key: "general", label: "General", Icon: SettingsIcon },
    { key: "editor", label: "Editor", Icon: TextCursorInput },
    { key: "ai", label: "AI", Icon: Bot },
    { key: "account", label: "Account", Icon: MonitorSmartphone },
  ];

  return (
    <div className="nk-set">
      <header className="nk-set-hd">
        <h1>Settings</h1>
        <button className="nk-set-done" onClick={onClose} aria-label="Done">
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="nk-set-body">
        {tab === "general" && (
          <>
            <Group label="Appearance">
              <div className="nk-set-row nk-set-row--stack">
                <span className="nk-set-row-title">Theme</span>
                <div className="nk-seg" role="group" aria-label="Theme">
                  <button className={theme === "light" ? "is-on" : ""} onClick={() => void patch({ theme: "light" })}>
                    <Sun size={16} aria-hidden />
                    <span>Light</span>
                  </button>
                  <button className={theme === "dark" ? "is-on" : ""} onClick={() => void patch({ theme: "dark" })}>
                    <Moon size={16} aria-hidden />
                    <span>Dark</span>
                  </button>
                  <button className={theme === "auto" ? "is-on" : ""} onClick={() => void patch({ theme: "auto" })}>
                    <Monitor size={16} aria-hidden />
                    <span>System</span>
                  </button>
                </div>
              </div>
            </Group>

            <Group label="Language">
              {LOCALES.map((l, i) => (
                <button
                  key={l.code}
                  className={`nk-set-row nk-set-row--tap${i > 0 ? " has-sep" : ""}`}
                  onClick={() => pickLocale(l.code)}
                >
                  <span className="nk-set-row-title">{l.label}</span>
                  {locale === l.code && <span className="nk-set-check" aria-hidden />}
                </button>
              ))}
            </Group>

            <Group label="Notes" footer="New notes are created in this folder by default.">
              <label className="nk-set-row">
                <span className="nk-set-row-title">Default folder</span>
                <select
                  className="nk-set-select"
                  value={activeSettings?.defaultFolder ?? ""}
                  onChange={(e) => void patch({ defaultFolder: e.target.value || null })}
                >
                  <option value="">None (root)</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </Group>
          </>
        )}

        {tab === "editor" && (
          <Group
            label="Editor"
            footer="Vim keybindings apply the next time you open a note."
          >
            <label className="nk-set-row">
              <span className="nk-set-row-title">Vim keybindings</span>
              <Toggle on={!!vimMode} onChange={() => onToggleVim?.()} />
            </label>
          </Group>
        )}

        {tab === "ai" && (
          <>
            <Group label="Assistant">
              <LinkRow label="Manage agents" onClick={onOpenAgents} icon={<Bot size={16} aria-hidden />} />
              <LinkRow label="Chat history" onClick={onOpenHistory} sep />
            </Group>
            {agents && agents.length > 0 && (
              <Group label="Default agent" footer="Used when you open the assistant.">
                <label className="nk-set-row">
                  <span className="nk-set-row-title">Agent</span>
                  <select
                    className="nk-set-select"
                    value={activeSettings?.defaultAgentSlug ?? ""}
                    onChange={(e) => void patch({ defaultAgentSlug: e.target.value || null })}
                  >
                    <option value="">First available</option>
                    {agents.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              </Group>
            )}
          </>
        )}

        {tab === "account" && (
          <>
            {user && (
              <Group label="Account">
                <div className="nk-set-row">
                  <span className="nk-set-row-title">Signed in as</span>
                  <span className="nk-set-row-value">{user.email}</span>
                </div>
                <div className="nk-set-row has-sep">
                  <span className="nk-set-row-title">Plan</span>
                  <span className="nk-set-row-value">{PLAN_LABEL[user.plan] ?? user.plan}</span>
                </div>
              </Group>
            )}

            <Group label="Security" footer="End-to-end encrypted — only your devices hold the keys.">
              <LinkRow
                label="Paired devices"
                onClick={onOpenDevices}
                icon={<MonitorSmartphone size={16} aria-hidden />}
              />
              <LinkRow
                label="Recovery phrase"
                onClick={() => openRecovery()}
                icon={<ShieldCheck size={16} aria-hidden />}
                sep
              />
              <LinkRow
                label="Access tokens"
                onClick={onOpenTokens}
                icon={<KeyRound size={16} aria-hidden />}
                sep
              />
            </Group>

            <Group label="Notifications">
              <LinkRow
                label="Notification settings"
                onClick={onOpenNotifications}
                icon={<Bell size={16} aria-hidden />}
              />
            </Group>

            <Group>
              {onSignOut && (
                <button className="nk-set-row nk-set-row--tap nk-set-row--danger" onClick={onSignOut}>
                  <span className="nk-set-row-title">
                    <LogOut size={16} aria-hidden /> Sign out
                  </span>
                </button>
              )}
              <div className="nk-set-row has-sep">
                <span className="nk-set-row-title">
                  <Info size={16} aria-hidden /> Version
                </span>
                <span className="nk-set-row-value">{APP_VERSION}</span>
              </div>
            </Group>
          </>
        )}
      </div>

      <nav className="nk-set-tabs" aria-label="Settings sections">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`nk-set-tab${tab === key ? " is-on" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={21} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Group({
  label,
  footer,
  children,
}: {
  label?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="nk-set-group">
      {label && <h2 className="nk-set-label">{label}</h2>}
      <div className="nk-set-card">{children}</div>
      {footer && <p className="nk-set-foot">{footer}</p>}
    </section>
  );
}

function LinkRow({
  label,
  onClick,
  icon,
  sep,
}: {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  sep?: boolean;
}) {
  if (!onClick) return null;
  return (
    <button className={`nk-set-row nk-set-row--tap${sep ? " has-sep" : ""}`} onClick={onClick}>
      <span className="nk-set-row-title">
        {icon} {label}
      </span>
      <ChevronRight size={17} className="nk-set-chevron" aria-hidden />
    </button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      className={`nk-set-toggle${on ? " is-on" : ""}`}
      role="switch"
      aria-checked={on}
      onClick={onChange}
    >
      <span className="nk-set-toggle-knob" />
    </button>
  );
}
