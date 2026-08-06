import { useState } from "react";
import { LogOut, Monitor, Moon, Sun, X } from "lucide-react";
import { useVaultStore } from "../stores/vaultStore";
import * as vaultApi from "../lib/vault-api";
import { LOCALES, currentLocale, setLocale } from "../i18n";
import type { User } from "../types/user";

/**
 * Mobile Settings — a dedicated full-screen page (Daymark-style grouped
 * sections) reached from the drawer. Replaces the oversized appearance toggle
 * that used to sit in the drawer foot. Covers Appearance (theme) + Language +
 * Account.
 */

interface MobileSettingsProps {
  user?: User | null;
  onSignOut?: () => void;
  onClose: () => void;
}

type ThemeChoice = "light" | "dark" | "auto";

export function MobileSettings({ user, onSignOut, onClose }: MobileSettingsProps) {
  const activeVaultId = useVaultStore((s) => s.activeId);
  const activeSettings = useVaultStore((s) => s.activeSettings);
  const setActiveSettings = useVaultStore((s) => s.setActiveSettings);
  const theme: ThemeChoice = activeSettings?.theme ?? "auto";
  const [locale, setLocaleState] = useState(currentLocale());

  async function setTheme(t: ThemeChoice) {
    if (!activeVaultId || !activeSettings) return;
    setActiveSettings({ ...activeSettings, theme: t });
    await vaultApi.patchVaultSettings(activeVaultId, { ...activeSettings, theme: t }).catch(() => {});
  }

  function pickLocale(code: string) {
    setLocale(code);
    setLocaleState(code);
  }

  return (
    <div className="nk-set">
      <header className="nk-set-hd">
        <h1>Settings</h1>
        <button className="nk-set-done" onClick={onClose} aria-label="Done">
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="nk-set-body">
        <section className="nk-set-group">
          <h2 className="nk-set-label">Appearance</h2>
          <div className="nk-set-card">
            <div className="nk-set-row nk-set-row--stack">
              <span className="nk-set-row-title">Theme</span>
              <div className="nk-seg" role="group" aria-label="Theme">
                <button
                  className={theme === "light" ? "is-on" : ""}
                  onClick={() => void setTheme("light")}
                >
                  <Sun size={16} aria-hidden />
                  <span>Light</span>
                </button>
                <button
                  className={theme === "dark" ? "is-on" : ""}
                  onClick={() => void setTheme("dark")}
                >
                  <Moon size={16} aria-hidden />
                  <span>Dark</span>
                </button>
                <button
                  className={theme === "auto" ? "is-on" : ""}
                  onClick={() => void setTheme("auto")}
                >
                  <Monitor size={16} aria-hidden />
                  <span>System</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="nk-set-group">
          <h2 className="nk-set-label">Language</h2>
          <div className="nk-set-card">
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
          </div>
        </section>

        {user && (
          <section className="nk-set-group">
            <h2 className="nk-set-label">Account</h2>
            <div className="nk-set-card">
              <div className="nk-set-row">
                <span className="nk-set-row-title">Signed in as</span>
                <span className="nk-set-row-value">{user.email}</span>
              </div>
              {onSignOut && (
                <button
                  className="nk-set-row nk-set-row--tap nk-set-row--danger has-sep"
                  onClick={onSignOut}
                >
                  <span className="nk-set-row-title">
                    <LogOut size={16} aria-hidden /> Sign out
                  </span>
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
