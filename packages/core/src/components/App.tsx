import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, Menu, Plus, Search, X } from "lucide-react";
import { MOBILE_BREAKPOINT, useMediaQuery } from "../hooks/useMediaQuery";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { MobileDrawer } from "./MobileDrawer";
import { useNotesStore } from "../stores/notesStore";
import { useSyncStore } from "../stores/syncStore";
import { useVaultStore } from "../stores/vaultStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { noteTitle } from "../lib/note-display";
import {
  getStatus as getVaultStatus,
  getVaultSettings,
  listVaults,
} from "../lib/vault-api";
import { refresh as refreshSync, start as startSync } from "../lib/sync";
import { bindVaultPersistence } from "../lib/vault-persistence";
import {
  startVaultEventStream,
  stopVaultEventStream,
} from "../lib/vault-events-client";
import { bootstrapCrypto } from "../lib/crypto-bootstrap";
import type { User } from "../types/user";
import { Editor, type EditorHandle } from "./Editor";
import { EditorToolbar } from "./EditorToolbar";
import { EncryptedSkippedBanner } from "./EncryptedSkippedBanner";
import { FirstEncryptDialog } from "./FirstEncryptDialog";
import { Sidebar } from "./Sidebar";
import { TicketsBoard } from "./TicketsBoard";
import { GraphView } from "./GraphView";
import { CalendarView } from "./CalendarView";
import { HistoryView } from "./HistoryView";
import { AgentsView } from "./AgentsView";
import { AccessTokensView } from "./AccessTokensView";
import { NotificationsInbox } from "./NotificationsInbox";
import { NotificationSettings } from "./NotificationSettings";
import { VaultPicker } from "./VaultPicker";
import { VaultSetup } from "./VaultSetup";
import { VaultPairNewDevice } from "./VaultPairing";
import { SecretsView } from "./SecretsView";
import { LinksView } from "./LinksView";
import { SearchPalette } from "./SearchPalette";
import { isValidYMD, journalYMDFromPath, shiftYMD, todayYMD } from "../lib/journal";
import type { SearchHit } from "../lib/search";

type MainView = "notes" | "tickets" | "graph" | "calendar" | "secrets" | "links";

interface AppProps {
  user?: User | null;
  onSignOut?: () => void;
}

export function App({ user, onSignOut }: AppProps = {}) {
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const note = useNotesStore((s) =>
    s.activeNoteId ? s.notes[s.activeNoteId] : null,
  );
  const updateBody = useNotesStore((s) => s.updateBody);
  const upsert = useNotesStore((s) => s.upsert);
  const setActive = useNotesStore((s) => s.setActive);
  const openJournal = useNotesStore((s) => s.openJournal);
  const updateJournalDraftBody = useNotesStore((s) => s.updateJournalDraftBody);
  const draftJournal = useNotesStore((s) => s.draftJournal);
  const phase = useSyncStore((s) => s.phase);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const vaultPhase = useVaultStore((s) => s.phase);
  const vault = useVaultStore((s) => s.vault);
  const setVault = useVaultStore((s) => s.setVault);
  const setVaults = useVaultStore((s) => s.setVaults);
  const setVaultPhase = useVaultStore((s) => s.setPhase);
  const setVaultError = useVaultStore((s) => s.setError);
  const setActiveSettings = useVaultStore((s) => s.setActiveSettings);
  const activeVaultId = useVaultStore((s) => s.activeId);
  const activeSettings = useVaultStore((s) => s.activeSettings);
  const cryptoPhase = useCryptoStore((s) => s.phase);
  const [view, setView] = useState<MainView>("notes");
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // On phone, list and detail are separate full-screen panes. `mobilePane`
  // tracks which one is on top — opening a note flips it to "detail", the
  // back-arrow in the editor header flips it back. Ignored on desktop where
  // both panes are always visible side-by-side.
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [focusTicket, setFocusTicket] = useState<{ id: string; seq: number } | null>(null);
  const [focusAgent, setFocusAgent] = useState<{ slug: string; seq: number } | null>(null);
  const editorRef = useRef<EditorHandle>(null);
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  const noteHeading = note ? noteTitle(note) : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      // ⌘P alias for ⌘K — Notion and VS Code both use ⌘P for the
      // quick-open palette; surfacing the same shortcut makes the
      // muscle memory portable.
      if (key === "k" || key === "p") {
        e.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      if (key === "n") {
        e.preventDefault();
        const folder =
          useVaultStore.getState().activeSettings?.defaultFolder ?? null;
        const created = upsert({ title: "Untitled", body: "", folder });
        setActive(created.id);
        return;
      }
      // Cmd+; opens calendar
      if (key === ";") {
        e.preventDefault();
        setView("calendar");
        return;
      }
      // Cmd+' opens today's journal (Cmd+T is reserved by browsers for new-tab)
      if (key === "'") {
        e.preventDefault();
        const ymd = e.shiftKey ? shiftYMD(todayYMD(), 1) : todayYMD();
        openJournal(ymd);
        setView("notes");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [upsert, setActive, openJournal]);

  useEffect(() => {
    function onOpen(e: Event) {
      const target = (e as CustomEvent<{ target: string }>).detail?.target;
      if (!target) return;
      const trimmed = target.trim();
      if (isValidYMD(trimmed)) {
        openJournal(trimmed);
        setView("notes");
        return;
      }
      const notes = useNotesStore.getState().all();
      const wanted = trimmed.toLowerCase();
      const found = notes.find(
        (n) => noteTitle(n).trim().toLowerCase() === wanted,
      );
      if (found) {
        setView("notes");
        setActive(found.id);
        return;
      }
      const created = upsert({ title: target, body: `# ${target}\n\n` });
      setView("notes");
      setActive(created.id);
    }
    window.addEventListener("notekit:open-wikilink", onOpen as EventListener);
    return () =>
      window.removeEventListener(
        "notekit:open-wikilink",
        onOpen as EventListener,
      );
  }, [upsert, setActive, openJournal]);

  // On phones, opening a note slides the editor over the list (notes view).
  // Other views render their primary content in the `<main>` pane — kanban,
  // month grid, graph — so on mobile we default those to "detail" and let
  // the user reach the sidebar list via the relevant bottom-nav tap. Tickets
  // is the exception: its sidebar list is the design-intended mobile surface
  // (matches the prototype's card stack), so it stays on "list".
  useEffect(() => {
    if (!isMobile) return;
    if (view === "notes") {
      setMobilePane(activeNoteId || draftJournal ? "detail" : "list");
    } else if (view === "tickets") {
      setMobilePane("list");
    } else {
      setMobilePane("detail");
    }
  }, [isMobile, view, activeNoteId, draftJournal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getVaultStatus();
        if (cancelled) return;
        if (!status.hasGithubToken) {
          setVaultPhase("needs-token");
          return;
        }
        if (status.configured && status.vault) {
          setVault(status.vault);
          // Populate the full vault list so the switcher is ready.
          listVaults()
            .then((res) => {
              if (!cancelled) setVaults(res.vaults, res.activeId);
            })
            .catch(() => {
              /* Switcher will retry on next open; not fatal. */
            });
          // Bind persistence BEFORE startSync so any saved state for this
          // vault is rehydrated before the subscribe baselines are taken.
          await bindVaultPersistence(status.vault);
          await startSync();
          // Open the real-time event stream so edits from other devices
          // arrive via push instead of waiting for the next focus-pull.
          startVaultEventStream();
          await bootstrapCrypto();
        } else {
          setVaultPhase("needs-pick");
        }
      } catch (e) {
        if (!cancelled) setVaultError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setVault, setVaults, setVaultPhase, setVaultError]);

  // Load per-vault settings whenever the active vault changes.
  useEffect(() => {
    if (!activeVaultId) {
      setActiveSettings(null);
      return;
    }
    let cancelled = false;
    getVaultSettings(activeVaultId)
      .then((res) => {
        if (!cancelled) setActiveSettings(res.settings);
      })
      .catch(() => {
        if (!cancelled) setActiveSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeVaultId, setActiveSettings]);

  // Pull from the remote on tab visibility / window focus so a device that
  // was backgrounded catches up on edits made elsewhere. refreshSync() is a
  // no-op if the engine hasn't started or local writes are still queued, so
  // it's safe to wire here unconditionally — covers web, Electron, and the
  // Capacitor WebView (which fires visibilitychange on app resume).
  useEffect(() => {
    function onWake() {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      void refreshSync();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onWake);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onWake);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onWake);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onWake);
      }
    };
  }, []);

  // Tear down the SSE event stream when the App unmounts. AuthGate
  // unmounts App on sign-out, so this catches that path; vault switches
  // and deletions handle the stream themselves in VaultSwitcher.
  useEffect(() => {
    return () => stopVaultEventStream();
  }, []);

  // Reflect the current note / view in the browser tab title — Notion,
  // Outline, and basically every multi-doc tool do this so users can
  // find the right tab in a sea of open tabs.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = "note/kit";
    let label: string | null = null;
    if (view === "notes") {
      label = draftJournal?.date ?? noteHeading;
    } else if (view === "tickets") {
      label = "Tickets";
    } else if (view === "calendar") {
      label = "Calendar";
    } else if (view === "graph") {
      label = "Graph";
    } else if (view === "secrets") {
      label = "Secrets";
    } else if (view === "links") {
      label = "Links";
    }
    document.title = label ? `${label} · ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [view, noteHeading, draftJournal]);

  // Resolve `auto` (or unset) theme to a concrete value, falling back to
  // the OS preference. Reactive — flipping the OS appearance updates
  // the app without a reload, same as the sign-in screen.
  const resolvedTheme = useResolvedTheme(activeSettings?.theme);

  // Mirror the theme onto <html> so the body's safe-area inset (which
  // lives above the .nk wrapper in the cascade) inherits `--bg` and
  // paints in the active theme instead of the hardcoded dark fallback.
  // Cleared on unmount so the SignIn route's locked-dark theme (set in
  // AuthGate.tsx) takes over cleanly on sign-out.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = resolvedTheme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [resolvedTheme]);

  async function onVaultPicked() {
    setVaultPhase("ready");
    // Populate the full vault list so the switcher is ready right away.
    listVaults()
      .then((res) => setVaults(res.vaults, res.activeId))
      .catch(() => {
        /* Non-fatal; the switcher will lazy-load. */
      });
    // Bind persistence to the just-picked vault before sync starts so its
    // saved state is rehydrated and future writes route to the right slot.
    const pickedVault = useVaultStore.getState().vault;
    if (pickedVault) await bindVaultPersistence(pickedVault);
    await startSync();
    startVaultEventStream();
    await bootstrapCrypto();
  }

  function onSearchSelect(hit: SearchHit) {
    switch (hit.payload.kind) {
      case "journal":
        openJournal(hit.payload.ymd);
        setView("notes");
        return;
      case "note":
        setActive(hit.payload.noteId);
        setView("notes");
        return;
      case "ticket":
        setView("tickets");
        setFocusTicket({ id: hit.payload.ticketId, seq: Date.now() });
        return;
      case "agent":
        setAgentsOpen(true);
        setFocusAgent({ slug: hit.payload.slug, seq: Date.now() });
        return;
      case "commit":
        window.open(hit.payload.url, "_blank", "noopener,noreferrer");
        return;
    }
  }

  const vaultLabel = vault ? `${vault.owner}/${vault.repo}` : "Local vault";

  // Editor binding: journal draft takes precedence over the active note so that
  // ⌘+' on an unvisited day shows an in-memory buffer until first keystroke.
  // Journal notes (existing or draft) share a stable key keyed by date so that
  // the editor does not remount when a draft materializes into a real note.
  const editorBinding = draftJournal
    ? {
        key: `journal-${draftJournal.date}`,
        body: draftJournal.body,
        onChange: updateJournalDraftBody,
      }
    : activeNoteId && note
      ? (() => {
          const journalDate = journalYMDFromPath(note.path);
          return {
            key: journalDate ? `journal-${journalDate}` : activeNoteId,
            body: note.body,
            onChange: (v: string) => updateBody(activeNoteId, v),
          };
        })()
      : null;

  const crumbLabel =
    view === "notes"
      ? draftJournal
        ? draftJournal.date
        : (noteHeading ?? "—")
      : view === "tickets"
        ? "Tickets"
        : view === "graph"
          ? "Graph"
          : view === "secrets"
            ? "Secrets"
            : view === "links"
              ? "Links"
              : "Calendar";

  function exitMobileDetail() {
    setActive(null);
    setMobilePane("list");
  }

  function onMobileView(next: MainView) {
    setView(next);
    setMobilePane("list");
    setDrawerOpen(false);
  }

  return (
    <div
      className="nk"
      data-dir="studio"
      data-theme={resolvedTheme}
    >
      <div
        className="nk-app"
        data-mobile={isMobile ? "true" : undefined}
        data-mobile-pane={isMobile ? mobilePane : undefined}
      >
        <Sidebar
          view={view}
          onView={setView}
          user={user}
          onSignOut={onSignOut}
          onOpenAgents={() => setAgentsOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenTokens={() => setTokensOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenMenu={isMobile ? () => setDrawerOpen(true) : undefined}
        />

        <main className="nk-main">
          {/* Hide the chrome row entirely on desktop when an editor is
           * mounted — the editor's H1 already shows the title, and the
           * "+" action is duplicated in the sidebar's section header.
           * Mobile keeps the row (it carries the back / menu buttons that
           * make the slide-over shell navigable). */}
          {(isMobile || view !== "notes" || !editorBinding) && (
            <header className="nk-main-hd">
              {isMobile && view === "notes" && mobilePane === "detail" ? (
                <button
                  className="nk-iconbtn nk-main-back"
                  onClick={exitMobileDetail}
                  aria-label="Back"
                  title="Back"
                >
                  <ArrowLeft size={18} aria-hidden />
                </button>
              ) : isMobile ? (
                <button
                  className="nk-iconbtn nk-main-menu"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open menu"
                  title="Menu"
                >
                  <Menu size={18} aria-hidden />
                </button>
              ) : null}
              <div className="nk-crumbs">
                <span className="last">{crumbLabel}</span>
              </div>
              {isMobile && mobilePane === "list" && (
                <button
                  className="nk-iconbtn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search"
                  title="Search"
                >
                  <Search size={16} aria-hidden />
                </button>
              )}
              {view === "notes" && (!isMobile || mobilePane === "list") && (
                <button
                  className="nk-iconbtn"
                  title="New note (⌘N)"
                  onClick={() => {
                    const folder = activeSettings?.defaultFolder ?? null;
                    const created = upsert({ title: "Untitled", body: "", folder });
                    setActive(created.id);
                  }}
                  aria-label="New note"
                >
                  +
                </button>
              )}
            </header>
          )}
          <EncryptedSkippedBanner />
          {view === "notes" && (
            <>
              {editorBinding && (
                <EditorToolbar
                  getEditor={() => editorRef.current?.editor ?? null}
                  onHistoryClick={() => setHistoryOpen(true)}
                />
              )}
              <div className="nk-editor-wrap">
                {editorBinding ? (
                  <Editor
                    key={editorBinding.key}
                    ref={editorRef}
                    value={editorBinding.body}
                    onChange={editorBinding.onChange}
                  />
                ) : (
                  <div className="nk-empty nk-empty--center">
                    <FileText
                      size={40}
                      aria-hidden
                      style={{
                        color: "var(--muted)",
                        opacity: 0.5,
                        marginBottom: 16,
                      }}
                    />
                    <p>No note selected.</p>
                    <p className="nk-empty-hint">
                      Pick one from the sidebar, or create a new one.
                    </p>
                    <button
                      className="nk-empty-cta"
                      onClick={() => {
                        const folder = activeSettings?.defaultFolder ?? null;
                        const created = upsert({ title: "Untitled", body: "", folder });
                        setActive(created.id);
                      }}
                    >
                      <Plus size={14} aria-hidden /> New note
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {view === "tickets" && <TicketsBoard focusTicket={focusTicket} />}
          {view === "graph" && <GraphView />}
          {view === "calendar" && (
            <CalendarView
              onOpenJournal={(ymd) => {
                openJournal(ymd);
                setView("notes");
              }}
              onOpenTicket={() => setView("tickets")}
            />
          )}
          {view === "secrets" && <SecretsView />}
          {view === "links" && <LinksView />}
        </main>

        <footer className="nk-statusbar">
          {/* Clicking the sync indicator triggers a manual pull —
           * useful when the user knows another device just edited a
           * note and doesn't want to wait for the visibility-change
           * auto-pull or refresh the whole page. Disabled while a sync
           * is already in flight so we don't queue duplicate pulls. */}
          <button
            className="nk-statusbar-sync"
            type="button"
            title="Pull from remote"
            disabled={phase === "fetching" || phase === "pushing"}
            onClick={() => void refreshSync()}
          >
            <span
              className={
                "dot" +
                (phase === "idle"
                  ? lastSyncedAt
                    ? ""
                    : " dot--idle"
                  : phase === "error"
                    ? " dot--error"
                    : " dot--sync")
              }
            />
            {syncLabel(phase, lastSyncedAt, vaultPhase, vaultLabel)}
          </button>
          <span>
            {view === "notes" && note ? noteCounter(note.body) : ""}
          </span>
        </footer>
      </div>
      {isMobile && (
        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          view={view}
          onView={onMobileView}
          user={user}
          syncStatus={syncLabel(phase, lastSyncedAt, vaultPhase, vaultLabel)}
          syncTone={syncTone(phase, lastSyncedAt, vaultPhase)}
          onSignOut={onSignOut}
          onOpenAgents={() => setAgentsOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenTokens={() => setTokensOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />
      )}
      {vaultPhase === "needs-pick" && (
        <VaultPicker onPicked={onVaultPicked} />
      )}
      {view === "secrets" && vaultPhase === "ready" && cryptoPhase === "needs-setup" && (
        <VaultSetup />
      )}
      {/*
       * Pair-this-device modal is hoisted out of the Secrets-tab gate so
       * users discover it from any view. E2EE on notes/tickets/links also
       * needs the device to be registered (`collectVaultRecipients` only
       * picks up devices that landed in `.notekit/devices/`), so blocking
       * it behind a tab navigation would leave new devices encrypting to
       * themselves only — readable on this device but not by other paired
       * devices. The modal is dismissable via the recovery-phrase escape
       * hatch if the user really wants to skip.
       */}
      {vaultPhase === "ready" && cryptoPhase === "needs-pair" && (
        <VaultPairNewDevice />
      )}
      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={onSearchSelect}
      />
      {agentsOpen && (
        <div
          className="nk-modal-backdrop"
          onClick={() => setAgentsOpen(false)}
        >
          <div
            className="nk-modal nk-modal--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nk-modal-hd">
              <h2>Agents</h2>
              <p className="nk-modal-sub">
                Give an AI assistant its own git identity. Commits it makes
                on your behalf are attributed to the agent, not to you.
              </p>
            </header>
            <button
              className="nk-modal-close nk-iconbtn"
              onClick={() => setAgentsOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
            <AgentsView focusAgent={focusAgent} />
          </div>
        </div>
      )}
      {tokensOpen && (
        <div
          className="nk-modal-backdrop"
          onClick={() => setTokensOpen(false)}
        >
          <div
            className="nk-modal nk-modal--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nk-modal-hd">
              <h2>API tokens</h2>
              <p className="nk-modal-sub">
                Long-lived credentials for the NoteKit CLI and the MCP server
                (Claude Desktop, Cursor). The full token is shown exactly once
                — copy it the moment you mint it.
              </p>
            </header>
            <button
              className="nk-modal-close nk-iconbtn"
              onClick={() => setTokensOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
            <AccessTokensView />
          </div>
        </div>
      )}
      {notificationsOpen && (
        <div
          className="nk-modal-backdrop"
          onClick={() => setNotificationsOpen(false)}
        >
          <div
            className="nk-modal nk-modal--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nk-modal-hd">
              <h2>Notifications</h2>
              <p className="nk-modal-sub">
                What agents have done in your vault — and which channels deliver
                those updates outside the app.
              </p>
            </header>
            <button
              className="nk-modal-close nk-iconbtn"
              onClick={() => setNotificationsOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <NotificationsInbox />
              <NotificationSettings />
            </div>
          </div>
        </div>
      )}
      {historyOpen && (
        <div
          className="nk-modal-backdrop"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="nk-modal nk-modal--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nk-modal-hd">
              <h2>Activity</h2>
              <p className="nk-modal-sub">
                Recent commits across this vault.
                {view === "notes" && note && " Filtered to the active note."}
              </p>
            </header>
            <button
              className="nk-modal-close nk-iconbtn"
              onClick={() => setHistoryOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
            <HistoryView
              notePath={view === "notes" && note ? note.path : undefined}
            />
          </div>
        </div>
      )}

      <FirstEncryptDialog />
    </div>
  );
}

// Word-then-chars in the status bar: writers care about word count
// (NaNoWriMo targets, blog post lengths), but char count still helps
// for tweet/caption-length writing. Both, formatted with thin-space
// thousand separators so a 50,000-word draft doesn't read as "50000".
function noteCounter(body: string): string {
  const chars = body.length;
  if (chars === 0) return "";
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const fmt = new Intl.NumberFormat();
  return `${fmt.format(words)} ${words === 1 ? "word" : "words"} · ${fmt.format(chars)} ${chars === 1 ? "char" : "chars"}`;
}

function syncLabel(
  phase: string,
  lastSyncedAt: string | null,
  vaultPhase: string,
  vaultLabel: string,
): string {
  if (vaultPhase === "needs-token") return "Sign in with GitHub to sync";
  if (vaultPhase === "needs-pick") return "Pick a vault repo";
  if (phase === "fetching") return "Pulling…";
  if (phase === "pushing") return "Syncing…";
  if (phase === "error") return "Sync error";
  if (lastSyncedAt) {
    // The vault label is now redundant — it shows in the sidebar header
    // (switcher) and again as the section title. The status bar should
    // just answer "when did we last sync?" in the fewest characters.
    return `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`;
  }
  return vaultLabel;
}

function syncTone(
  phase: string,
  lastSyncedAt: string | null,
  vaultPhase: string,
): "idle" | "sync" | "error" | "ready" {
  if (vaultPhase === "needs-token" || vaultPhase === "needs-pick") return "idle";
  if (phase === "error") return "error";
  if (phase === "fetching" || phase === "pushing") return "sync";
  if (lastSyncedAt) return "ready";
  return "idle";
}
