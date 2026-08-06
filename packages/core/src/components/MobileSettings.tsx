import { useEffect, useState } from "react";
import {
  Bell,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Download,
  Info,
  KeyRound,
  LogOut,
  Minus,
  Monitor,
  MonitorSmartphone,
  Moon,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  TextCursorInput,
  Upload,
  X,
} from "lucide-react";
import { useVaultStore } from "../stores/vaultStore";
import { useNotesStore } from "../stores/notesStore";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import * as vaultApi from "../lib/vault-api";
import { listAgents, type AgentProfile } from "../lib/agents-api";
import {
  FONT_LABELS,
  MAX_SIZE,
  MIN_SIZE,
  getEditorFont,
  getEditorSize,
  setEditorFont,
  setEditorSize,
  type EditorFont,
} from "../lib/editor-prefs";
import {
  ACCENTS,
  ACCENT_COLORS,
  ACCENT_LABELS,
  getAccent,
  getCustomAccent,
  setAccent,
  setCustomAccent,
  type Accent,
} from "../lib/accent";
import {
  BASE_COLORS,
  BASE_LABELS,
  BASE_SWATCH,
  LOGO_LABELS,
  LOGO_STYLES,
  RADII,
  RADIUS_LABELS,
  UI_FONTS,
  UI_FONT_LABELS,
  getBaseColor,
  getCustomBase,
  getLogoStyle,
  getRadius,
  getUiFont,
  setBaseColor,
  setCustomBase,
  setLogoStyle,
  setRadius,
  setUiFont,
  type BaseColor,
  type LogoStyle,
  type RadiusChoice,
  type UiFont,
} from "../lib/appearance";
import { noteTitle } from "../lib/note-display";
import type { Note } from "../types/note";
import { LOCALES, currentLocale, setLocale } from "../i18n";
import type { User } from "../types/user";

/**
 * Mobile Settings — a dedicated full-screen page with four tabs (General ·
 * Editor · AI · Account), matching Daymark's multi-tab settings but mapped to
 * NoteKit's real capabilities. Consolidates settings that were scattered across
 * the drawer's account menu (agents, devices, tokens, notifications, recovery).
 */

const APP_VERSION = "0.1.0";

type Tab = "general" | "editor" | "ai" | "export" | "account";
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

// eslint-disable-next-line max-lines-per-function, complexity -- full-screen settings page with five tabs (General, Editor, AI, Export, Account) each with multiple controls
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
  const [font, setFont] = useState<EditorFont>(getEditorFont());
  const [size, setSize] = useState(getEditorSize());
  const [accent, setAccentState] = useState<Accent>(getAccent());
  const [customAccent, setCustomAccentState] = useState(getCustomAccent());
  const [base, setBaseState] = useState<BaseColor>(getBaseColor());
  const [customBase, setCustomBaseState] = useState(getCustomBase());
  const [uiFont, setUiFontState] = useState<UiFont>(getUiFont());
  const [radius, setRadiusState] = useState<RadiusChoice>(getRadius());
  const [logo, setLogoState] = useState<LogoStyle>(getLogoStyle());
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  function pickAccent(a: Accent) {
    setAccentState(a);
    setAccent(a);
  }
  function pickBase(b: BaseColor) {
    setBaseState(b);
    setBaseColor(b);
  }
  function pickCustomAccent(hex: string) {
    setCustomAccentState(hex);
    setCustomAccent(hex);
    setAccentState("custom");
  }
  function pickCustomBase(hex: string) {
    setCustomBaseState(hex);
    setCustomBase(hex);
    setBaseState("custom");
  }
  function pickUiFont(f: UiFont) {
    setUiFontState(f);
    setUiFont(f);
  }
  function pickRadius(r: RadiusChoice) {
    setRadiusState(r);
    setRadius(r);
  }
  function pickLogo(l: LogoStyle) {
    setLogoState(l);
    setLogoStyle(l);
  }

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
    await vaultApi.patchVaultSettings(activeVaultId, next).catch(() => { /* intentional noop — best-effort sync; local state already updated */ });
  }

  function pickLocale(code: string) {
    setLocale(code);
    setLocaleState(code);
  }

  function pickFont(f: EditorFont) {
    setFont(f);
    setEditorFont(f);
  }
  function bumpSize(delta: number) {
    const next = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size + delta));
    setSize(next);
    setEditorSize(next);
  }

  /** Serialize every note to one Markdown document. */
  function buildMarkdownExport(): string {
    const notes = (Object.values(useNotesStore.getState().notes) as Note[]).filter(
      (n) => n.format !== "ink",
    );
    notes.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return notes
      .map((n) => {
        const title = noteTitle(n);
        const body = (n.body ?? "").trim();
        return `# ${title}\n\n${body}\n`;
      })
      .join("\n\n---\n\n");
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(buildMarkdownExport());
      setExportMsg("Copied all notes to the clipboard.");
    } catch {
      setExportMsg("Couldn't copy — try Download instead.");
    }
  }

  function downloadExport() {
    try {
      const blob = new Blob([buildMarkdownExport()], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notekit-notes-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setExportMsg("Exported as a Markdown file.");
    } catch {
      setExportMsg("Couldn't export on this device — try Copy instead.");
    }
  }

  const noteCount = (Object.values(useNotesStore.getState().notes) as Note[]).filter(
    (n) => n.format !== "ink",
  ).length;

  const TABS: { key: Tab; label: string; Icon: typeof SettingsIcon }[] = [
    { key: "general", label: "General", Icon: SettingsIcon },
    { key: "editor", label: "Editor", Icon: TextCursorInput },
    { key: "ai", label: "AI", Icon: Bot },
    { key: "export", label: "Export", Icon: Upload },
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
              <div className="nk-set-row nk-set-row--stack has-sep">
                <span className="nk-set-row-title">Accent</span>
                <div className="nk-set-swatches" role="group" aria-label="Accent color">
                  {ACCENTS.map((a) =>
                    a === "custom" ? (
                      <label
                        key={a}
                        className={`nk-set-swatch nk-set-swatch--custom${accent === "custom" ? " is-on" : ""}`}
                        title="Custom accent"
                      >
                        <span className="nk-set-swatch-dot" style={{ background: customAccent }} />
                        <input
                          type="color"
                          value={customAccent}
                          onChange={(e) => pickCustomAccent(e.target.value)}
                        />
                      </label>
                    ) : (
                      <button
                        key={a}
                        className={`nk-set-swatch${accent === a ? " is-on" : ""}`}
                        onClick={() => pickAccent(a)}
                        title={ACCENT_LABELS[a]}
                        aria-label={ACCENT_LABELS[a]}
                      >
                        <span
                          className={`nk-set-swatch-dot${a === "mono" ? " is-mono" : ""}`}
                          style={a === "mono" ? undefined : { background: ACCENT_COLORS[a as keyof typeof ACCENT_COLORS] }}
                        />
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="nk-set-row nk-set-row--stack has-sep">
                <span className="nk-set-row-title">Base color</span>
                <div className="nk-set-swatches" role="group" aria-label="Base color">
                  {BASE_COLORS.map((b) =>
                    b === "custom" ? (
                      <label
                        key={b}
                        className={`nk-set-swatch nk-set-swatch--custom${base === "custom" ? " is-on" : ""}`}
                        title="Custom base tint"
                      >
                        <span className="nk-set-swatch-dot" style={{ background: customBase }} />
                        <input
                          type="color"
                          value={customBase}
                          onChange={(e) => pickCustomBase(e.target.value)}
                        />
                      </label>
                    ) : (
                      <button
                        key={b}
                        className={`nk-set-swatch${base === b ? " is-on" : ""}`}
                        onClick={() => pickBase(b)}
                        title={BASE_LABELS[b]}
                        aria-label={BASE_LABELS[b]}
                      >
                        <span
                          className="nk-set-swatch-dot"
                          style={{ background: BASE_SWATCH[b as keyof typeof BASE_SWATCH] }}
                        />
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="nk-set-row nk-set-row--stack has-sep">
                <span className="nk-set-row-title">App font</span>
                <div className="nk-seg nk-seg--wrap" role="group" aria-label="App font">
                  {UI_FONTS.map((f) => (
                    <button key={f} className={uiFont === f ? "is-on" : ""} onClick={() => pickUiFont(f)}>
                      {UI_FONT_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="nk-set-row nk-set-row--stack has-sep">
                <span className="nk-set-row-title">Radius</span>
                <div className="nk-seg" role="group" aria-label="Radius">
                  {RADII.map((r) => (
                    <button key={r} className={radius === r ? "is-on" : ""} onClick={() => pickRadius(r)}>
                      {RADIUS_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="nk-set-row nk-set-row--stack has-sep">
                <span className="nk-set-row-title">Logo</span>
                <div className="nk-seg" role="group" aria-label="Logo style">
                  {LOGO_STYLES.map((l) => (
                    <button key={l} className={logo === l ? "is-on" : ""} onClick={() => pickLogo(l)}>
                      {LOGO_LABELS[l]}
                    </button>
                  ))}
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
          <>
            <Group label="Typography">
              <div className="nk-set-row nk-set-row--stack">
                <span className="nk-set-row-title">Font</span>
                <div className="nk-seg" role="group" aria-label="Font">
                  {(Object.keys(FONT_LABELS) as EditorFont[]).map((f) => (
                    <button key={f} className={font === f ? "is-on" : ""} onClick={() => pickFont(f)}>
                      <span style={{ fontFamily: f === "serif" ? "Georgia, serif" : f === "mono" ? "ui-monospace, monospace" : "inherit" }}>
                        {FONT_LABELS[f]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="nk-set-row has-sep">
                <span className="nk-set-row-title">Font size</span>
                <div className="nk-set-stepper">
                  <button onClick={() => bumpSize(-1)} disabled={size <= MIN_SIZE} aria-label="Smaller">
                    <Minus size={16} aria-hidden />
                  </button>
                  <span className="nk-set-stepper-val">{size}</span>
                  <button onClick={() => bumpSize(1)} disabled={size >= MAX_SIZE} aria-label="Larger">
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
              </div>
            </Group>

            <Group label="Behavior" footer="Vim keybindings apply the next time you open a note.">
              <label className="nk-set-row">
                <span className="nk-set-row-title">Vim keybindings</span>
                <Toggle on={!!vimMode} onChange={onToggleVim ?? (() => { /* intentional noop when no handler provided */ })} />
              </label>
            </Group>
          </>
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

        {tab === "export" && (
          <>
            <Group
              label="Export notes"
              footer={`Bundles all ${noteCount} note${noteCount === 1 ? "" : "s"} into one Markdown document. Your notes are already plain Markdown files in your vault — this is just a portable copy.`}
            >
              <button className="nk-set-row nk-set-row--tap" onClick={() => void copyExport()}>
                <span className="nk-set-row-title">
                  <Copy size={16} aria-hidden /> Copy as Markdown
                </span>
                <ChevronRight size={17} className="nk-set-chevron" aria-hidden />
              </button>
              <button className="nk-set-row nk-set-row--tap has-sep" onClick={downloadExport}>
                <span className="nk-set-row-title">
                  <Download size={16} aria-hidden /> Download .md
                </span>
                <ChevronRight size={17} className="nk-set-chevron" aria-hidden />
              </button>
            </Group>
            {exportMsg && (
              <p className="nk-set-note">
                <Check size={14} aria-hidden /> {exportMsg}
              </p>
            )}

            <Group label="Privacy">
              <div className="nk-set-row">
                <span className="nk-set-row-title">
                  <ShieldCheck size={16} aria-hidden /> End-to-end encrypted
                </span>
              </div>
              <div className="nk-set-row has-sep">
                <span className="nk-set-row-title">
                  <Info size={16} aria-hidden /> No analytics leave your device
                </span>
              </div>
            </Group>
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
