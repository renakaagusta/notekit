import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Menu,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
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
import {
  refresh as refreshSync,
  start as startSync,
  pull as pullSync,
} from "../lib/sync";
import { bindVaultPersistence } from "../lib/vault-persistence";
import { publishMyKeys } from "../lib/directory";
import {
  startVaultEventStream,
  stopVaultEventStream,
} from "../lib/vault-events-client";
import { bootstrapCrypto } from "../lib/crypto-bootstrap";
import type { User } from "../types/user";
import { Editor, type EditorHandle } from "./Editor";
import { InkCanvas } from "./InkCanvas";
import { parseInk, serializeInk } from "../lib/ink";
import { emptyInkDocument } from "../types/ink";
import { EditorToolbar } from "./EditorToolbar";
import { EncryptedSkippedBanner } from "./EncryptedSkippedBanner";
import { FirstEncryptDialog } from "./FirstEncryptDialog";
import { ShareDialog } from "./ShareDialog";
import { RecoveryBackupNudge } from "./RecoveryBackupNudge";
import { RecoveryBackupSheet } from "./RecoveryBackupSheet";
import { Sidebar } from "./Sidebar";
import { TicketsBoard } from "./TicketsBoard";
import { GraphView } from "./GraphView";
import { CalendarView } from "./CalendarView";
import { HistoryView } from "./HistoryView";
import { AgentsView } from "./AgentsView";
import { AccessTokensView } from "./AccessTokensView";
import { DevicesPanel } from "./DevicesPanel";
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

/**
 * The initial content pull (startSync) can finish before bootstrapCrypto has
 * loaded this device's age identity — sync.ts reads `device.identity` at pull
 * time, so a race leaves every encrypted note/ticket/link skipped, and pull()
 * does a replaceAll so they're dropped from the local cache too. Once crypto is
 * ready we re-pull so those items decrypt and hydrate, instead of staying
 * invisible until the next focus/visibility refresh (which on a freshly-opened
 * mobile WebView may never fire). No-op when nothing was skipped or the device
 * still has no identity (genuinely unpaired — that path shows the pair dialog).
 */
async function rehydrateEncryptedIfSkipped(): Promise<void> {
  const skipped = useSyncStore.getState().encryptedSkipped;
  const total = skipped.notes + skipped.tickets + skipped.links;
  if (total === 0) return;
  if (!useCryptoStore.getState().device?.identity) return;
  await pullSync();
}

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
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop sidebar collapse. Persisted so it survives reloads. Ignored on
  // mobile, where the drawer is the navigation surface.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("nk:sidebar-collapsed") === "1",
  );
  useEffect(() => {
    localStorage.setItem("nk:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
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
      // muscle memory portable. ⌘⇧P (below) triggers print so the
      // browser's default Cmd+P=print still has a path.
      if (key === "p" && !e.shiftKey) {
        e.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      if (key === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      // ⌘⇧P → print active note. Pairs with iter 35's @media print
      // rules to produce a clean printable page. Same split VS Code
      // uses: ⌘P = quick open, ⌘⇧P = command palette / system action.
      if (key === "p" && e.shiftKey) {
        e.preventDefault();
        if (typeof window !== "undefined") window.print();
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
        // Don't gate on a GitHub token: NoteKit-hosted Git (Forgejo) vaults
        // need none. If there's a configured active vault of ANY provider,
        // load it. Only fall through to the empty states when there isn't one.
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
          // bootstrapCrypto only does a handful of small server-API reads
          // (recovery.json + device records) and is independent of the
          // content sync. Kick it off in parallel with startSync so the
          // pairing / setup dialog appears right away instead of waiting
          // for the entire vault to pull — the long delay users hit when
          // a fresh device needs to pair after sign-in.
          const cryptoReady = bootstrapCrypto();
          await startSync();
          // Open the real-time event stream so edits from other devices
          // arrive via push instead of waiting for the next focus-pull.
          startVaultEventStream();
          await cryptoReady;
          await rehydrateEncryptedIfSkipped();
        } else if (status.hasGithubToken) {
          // A git provider is connected but no active vault → pick/create one.
          setVaultPhase("needs-pick");
        } else {
          // No vault and no provider yet → empty state to set one up.
          setVaultPhase("needs-token");
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

  // When crypto becomes `ready` after the initial mount — i.e. the user
  // just finished pairing this device — items skipped by the pre-pairing
  // pull won't appear until something re-pulls. Re-hydrate on the
  // transition. The approving device re-encrypts existing items *after*
  // writing the new device record, and the new device flips to `ready` as
  // soon as it sees that record, so the first re-pull can race the
  // re-encryption commit — retry a few times until nothing's left skipped.
  useEffect(() => {
    if (cryptoPhase !== "ready") return;
    // Publish our public keys to the directory so others can share with us.
    // Done here (not only in bootstrap) so the first-run path — which finishes
    // via VaultSetup, not bootstrap's ready branch — also publishes.
    void publishMyKeys().catch(() => {});
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = async () => {
      if (cancelled) return;
      await rehydrateEncryptedIfSkipped();
      const s = useSyncStore.getState().encryptedSkipped;
      tries += 1;
      if (!cancelled && s.notes + s.tickets + s.links > 0 && tries < 4) {
        timer = setTimeout(attempt, 2500);
      }
    };
    timer = setTimeout(attempt, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cryptoPhase]);

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
    // Run crypto bootstrap in parallel with the content sync — it only
    // needs a few small server-API reads, so the pairing / setup dialog
    // shouldn't wait for the full vault pull. (See the mount effect above.)
    const cryptoReady = bootstrapCrypto();
    await startSync();
    startVaultEventStream();
    await cryptoReady;
    await rehydrateEncryptedIfSkipped();
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

  // Drawing notes (format "ink") swap the markdown editor for the pen
  // canvas. Journal drafts are always markdown, so they never qualify.
  const isInkNote = !draftJournal && note?.format === "ink" && !!activeNoteId;

  // Secrets and Links render their own title header (with actions), so the
  // breadcrumb would just repeat it. Blank the crumb for them and drop the
  // breadcrumb row on desktop (it still appears on mobile / when collapsed
  // to carry the menu / expand buttons — but without the duplicate title).
  const viewOwnsTitle = view === "secrets" || view === "links";
  const crumbLabel = viewOwnsTitle
    ? ""
    : view === "notes"
      ? draftJournal
        ? draftJournal.date
        : (noteHeading ?? "—")
      : view === "tickets"
        ? "Tickets"
        : view === "graph"
          ? "Graph"
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
        data-sidebar-collapsed={
          !isMobile && sidebarCollapsed ? "true" : undefined
        }
      >
        <Sidebar
          view={view}
          onView={setView}
          user={user}
          onSignOut={onSignOut}
          onOpenAgents={() => setAgentsOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenTokens={() => setTokensOpen(true)}
          onOpenDevices={() => setDevicesOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenMenu={isMobile ? () => setDrawerOpen(true) : undefined}
          onCollapse={isMobile ? undefined : () => setSidebarCollapsed(true)}
        />

        <main className="nk-main">
          {/* Hide the chrome row entirely on desktop when an editor is
           * mounted — the editor's H1 already shows the title, and the
           * "+" action is duplicated in the sidebar's section header.
           * Mobile keeps the row (it carries the back / menu buttons that
           * make the slide-over shell navigable). */}
          {(isMobile ||
            sidebarCollapsed ||
            (!viewOwnsTitle && (view !== "notes" || !editorBinding))) && (
            <header className="nk-main-hd">
              {!isMobile && sidebarCollapsed && (
                <button
                  className="nk-iconbtn nk-main-expand"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label="Show sidebar"
                  title="Show sidebar"
                >
                  <PanelLeft size={16} aria-hidden />
                </button>
              )}
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
          <RecoveryBackupNudge />
          <EncryptedSkippedBanner />
          {view === "notes" && (
            <>
              {editorBinding && !isInkNote && (
                <EditorToolbar
                  getEditor={() => editorRef.current?.editor ?? null}
                  onHistoryClick={() => setHistoryOpen(true)}
                />
              )}
              <div className="nk-editor-wrap">
                {editorBinding && isInkNote && activeNoteId ? (
                  <div className="nk-ink-wrap">
                    <InkCanvas
                      key={editorBinding.key}
                      doc={parseInk(editorBinding.body)}
                      onChange={(d) =>
                        updateBody(activeNoteId, serializeInk(d))
                      }
                    />
                  </div>
                ) : editorBinding ? (
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
                    <div className="nk-empty-cta-row">
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
                      <button
                        className="nk-empty-cta"
                        onClick={() => {
                          const folder = activeSettings?.defaultFolder ?? null;
                          const created = upsert({
                            title: "Drawing",
                            body: serializeInk(emptyInkDocument()),
                            folder,
                            format: "ink",
                          });
                          setActive(created.id);
                        }}
                      >
                        <Pencil size={14} aria-hidden /> New drawing
                      </button>
                    </div>
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

        {/* Sync status belongs to the sidebar column — it reads as the
         * sidebar's footer. Clicking the sync indicator triggers a manual
         * pull, useful when the user knows another device just edited a
         * note and doesn't want to wait for the visibility-change
         * auto-pull. Disabled while a sync is already in flight so we
         * don't queue duplicate pulls. */}
        <footer className="nk-statusbar nk-statusbar--sync">
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
        </footer>
        {/* Word/char count lives in the document column, flush with the
         * editor — no top border so it reads as part of the page. */}
        <footer className="nk-statusbar nk-statusbar--count">
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
          onOpenDevices={() => setDevicesOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />
      )}
      {vaultPhase === "needs-pick" && (
        <VaultPicker onPicked={onVaultPicked} />
      )}
      {/*
       * First-run setup is hoisted out of the Secrets-tab gate (it used to
       * require `view === "secrets"`). With E2EE-everywhere a fresh device
       * must initialize the vault — write `recovery.json` + register itself —
       * before *any* item can be sealed, so gating setup behind a tab the
       * user might never open left the vault uninitialized and every item
       * silently unsealed. `VaultSetup` is a brief, silent step, safe to run
       * from any view.
       */}
      {vaultPhase === "ready" && cryptoPhase === "needs-setup" && (
        <VaultSetup />
      )}
      {/*
       * Pair-this-device modal is likewise discoverable from any view. E2EE on
       * notes/tickets/links needs the device registered (`collectVaultRecipients`
       * only picks up devices in `.notekit/devices/`), so blocking it behind a
       * tab would leave new devices encrypting to themselves only — readable
       * here but not by other paired devices. Escapable when truly locked out
       * (no phrase, no other device, not a wallet vault) via the dialog's
       * "Start a new vault" action.
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
      {devicesOpen && (
        <div
          className="nk-modal-backdrop"
          onClick={() => setDevicesOpen(false)}
        >
          <div
            className="nk-modal nk-modal--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nk-modal-hd">
              <h2>Devices</h2>
              <p className="nk-modal-sub">
                Devices paired to your encrypted vault. Pair a new one with a
                6-digit code, or unlock it with your recovery phrase — verify
                the emoji fingerprint matches on both screens before approving.
              </p>
            </header>
            <button
              className="nk-modal-close nk-iconbtn"
              onClick={() => setDevicesOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
            <DevicesPanel />
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
      <ShareDialog />
      <RecoveryBackupSheet />
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
  if (vaultPhase === "needs-token") return "Set up a vault to sync";
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
