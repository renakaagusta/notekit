import "../i18n"; // initialize i18next before any component renders
import "../composition/secrets-browser"; // wire the secrets vault to browser adapters before any secret op
import { useEffect, useRef, useState } from "react";
import { isDesktop } from "../adapters/driven/api";
import { bootstrapCrypto } from "../composition/crypto-bootstrap";
import { publishMyKeys } from "../composition/directory";
import { vaultEventStream } from "../composition/vault-events";
import { vaultManagement } from "../composition/vault-management";
import { refresh as refreshSync, start as startSync } from "../composition/vault-sync";
import type { User } from "../domain/entities/user";
import { noteTitle } from "../domain/note-display";
import { MOBILE_BREAKPOINT, useMediaQuery } from "../hooks/useMediaQuery";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { applyAccent } from "../lib/accent";
import { applyAppearance } from "../lib/appearance";
import { applyEditorPrefs } from "../lib/editor-prefs";
import type { SearchHit } from "../lib/search";
import { bindVaultPersistence } from "../lib/vault-persistence";
import { useAIChatStore } from "../stores/aiChatStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { findLeaf, useLayoutStore } from "../stores/layoutStore";
import { useNotesStore } from "../stores/notesStore";
import { useSyncStore } from "../stores/syncStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";
import { AIAssistantFab } from "./AIAssistantFab";
import { AIAssistantPanel } from "./AIAssistantPanel";
import { noteCounter, syncLabel, syncTone } from "./AppHelpers";
import { AppModals } from "./AppModals";
import type { MainView } from "./AppTypes";
import { EncryptedSkippedBanner } from "./EncryptedSkippedBanner";
import { FirstEncryptDialog } from "./FirstEncryptDialog";
import { GraphView } from "./GraphView";
import { HomePane } from "./HomePane";
import { MainAppBar } from "./MainAppBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileDrawer } from "./MobileDrawer";
import { MobileSettings } from "./MobileSettings";
import { RecoveryBackupNudge } from "./RecoveryBackupNudge";
import { RecoveryBackupSheet } from "./RecoveryBackupSheet";
import { SearchPalette } from "./SearchPalette";
import { ShareDialog } from "./ShareDialog";
import { Sidebar } from "./Sidebar";
import { SplitPane } from "./SplitPane";
import { TasksView } from "./TasksView";
import { useAppKeyboardShortcuts } from "./useAppKeyboardShortcuts";
import { rehydrateEncryptedIfSkipped, useVaultBoot } from "./useVaultBoot";
import { useWikilinkHandler } from "./useWikilinkHandler";
import { VaultPairNewDevice } from "./VaultPairing";
import { VaultPicker } from "./VaultPicker";
import { VaultSetup } from "./VaultSetup";

// On macOS desktop we hide the native title bar (titleBarStyle: hiddenInset)
// so the app chrome flows up to the window edge with the traffic lights
// floating over the sidebar brand row. This flag drives the CSS that pads
// the brand row clear of the stoplights and marks the top rows draggable.
// Web and non-mac desktop keep the normal frame, so no offset is applied.
const isDesktopMac =
  isDesktop &&
  typeof navigator !== "undefined" &&
  /Mac/i.test(navigator.userAgent);

interface AppProps {
  user?: User | null;
  onSignOut?: () => void;
}

// eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity -- App is the root shell component: vault boot, crypto, sync, SSE, theming, keyboard, mobile shell, and all modal/panel routing live here
export function App({ user, onSignOut }: AppProps = {}) {
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const note = useNotesStore((s) =>
    s.activeNoteId ? s.notes[s.activeNoteId] : null,
  );
  const upsert = useNotesStore((s) => s.upsert);
  const setActive = useNotesStore((s) => s.setActive);
  const openJournal = useNotesStore((s) => s.openJournal);
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
  // Mobile lands on the Home dashboard; desktop keeps the notes workspace.
  const [view, setView] = useState<MainView>(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches
      ? "home"
      : "notes",
  );
  // Which rail icon is "current". Tracked separately from `view` because Graph
  // and Tasks render as tabs in the notes pane (they set view="notes"), so the
  // rail can't derive its active icon from `view` alone. Set on every rail click.
  const [railSurface, setRailSurface] = useState<MainView>(view);
  const [agentsOpen, setAgentsOpen] = useState(false);
  // Bump when the Agents modal closes so the AI panel re-checks its setup
  // state (key added? profile created?) without needing a full reopen.
  const [aiSetupTick, setAiSetupTick] = useState(0);
  const prevAgentsOpen = useRef(false);
  useEffect(() => {
    if (prevAgentsOpen.current && !agentsOpen) setAiSetupTick((t) => t + 1);
    prevAgentsOpen.current = agentsOpen;
  }, [agentsOpen]);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Desktop sidebar collapse. Persisted so it survives reloads. Ignored on
  // mobile, where the drawer is the navigation surface.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("nk:sidebar-collapsed") === "1",
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    () => Number(localStorage.getItem("nk:sidebar-width") || 0) || 240,
  );
  useEffect(() => {
    localStorage.setItem("nk:sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  function onSidebarDragStart(e: React.MouseEvent) {
    e.preventDefault();
    sidebarDragRef.current = { startX: e.clientX, startW: sidebarWidth };
    setSidebarDragging(true);
    function onMove(ev: MouseEvent) {
      if (!sidebarDragRef.current) return;
      const w = Math.min(480, Math.max(160, sidebarDragRef.current.startW + ev.clientX - sidebarDragRef.current.startX));
      setSidebarWidth(w);
    }
    function onUp() {
      sidebarDragRef.current = null;
      setSidebarDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  // ── AI assistant panel — third dock column, resizable like the sidebar ──
  const aiOpen = useAIChatStore((s) => s.open);
  const [aiWidth, setAiWidth] = useState(
    () => Number(localStorage.getItem("nk:ai-panel-width") || 0) || 340,
  );
  useEffect(() => {
    localStorage.setItem("nk:ai-panel-width", String(aiWidth));
  }, [aiWidth]);
  const aiDragRef = useRef<{ startX: number; startW: number } | null>(null);
  function onAiDragStart(e: React.MouseEvent) {
    e.preventDefault();
    aiDragRef.current = { startX: e.clientX, startW: aiWidth };
    function onMove(ev: MouseEvent) {
      if (!aiDragRef.current) return;
      // Drag the LEFT edge: moving left widens the panel.
      const w = Math.min(
        560,
        Math.max(260, aiDragRef.current.startW + (aiDragRef.current.startX - ev.clientX)),
      );
      setAiWidth(w);
    }
    function onUp() {
      aiDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const [zenMode, setZenMode] = useState(false);
  const [vimMode, setVimMode] = useState(
    () => localStorage.getItem("nk:vim-mode") === "1",
  );
  useEffect(() => {
    localStorage.setItem("nk:vim-mode", vimMode ? "1" : "0");
  }, [vimMode]);
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
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  const layout = useLayoutStore((s) => s.layout);
  const openNoteInLayout = useLayoutStore((s) => s.openNote);
  const noteHeading = note ? noteTitle(note) : null;

  useAppKeyboardShortcuts({
    setSearchOpen,
    setView,
    setZenMode,
    upsert,
    openNoteInLayout,
    openJournal,
  });

  // Sync sidebar / keyboard note activations to the layout store so the
  // active pane opens the note as a tab. Skips when the layout already
  // shows the note (prevents the loop from layoutStore.openNote → setActive).
  useEffect(() => {
    if (!activeNoteId) return;
    const { layout: l, activePaneId: pid } = useLayoutStore.getState();
    const leaf = findLeaf(l, pid);
    const cur = leaf?.activeTab;
    if (cur?.type === "note" && cur.id === activeNoteId) return;
    openNoteInLayout(activeNoteId);
  }, [activeNoteId, openNoteInLayout]);

  // Opening a note from anywhere (search, wikilink, Home, the tree) means we're
  // on the Notes surface — keep the rail's highlight in sync even when the nav
  // didn't go through the rail's onView. Graph/Tasks don't touch activeNoteId,
  // so their rail selection (set in onView) survives.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the rail highlight onto the Notes surface when a note is activated from any path
    if (activeNoteId) setRailSurface("notes");
  }, [activeNoteId]);

  useWikilinkHandler({
    upsert,
    setActive,
    openJournal,
    openNoteInLayout,
    setView,
  });

  // On phones, opening a note slides the editor over the list (notes view).
  // Other views render their primary content in the `<main>` pane — kanban,
  // month grid, graph — so on mobile we default those to "detail" and let
  // the user reach the sidebar list via the relevant bottom-nav tap. Tickets
  // is the exception: its sidebar list is the design-intended mobile surface
  // (matches the prototype's card stack), so it stays on "list".
  useEffect(() => {
    if (!isMobile) return;
    if (view === "notes") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mobilePane is derived from view/activeNoteId; synchronous setState avoids a missed frame on navigation
      setMobilePane(activeNoteId || draftJournal ? "detail" : "list");
    } else if (view === "secrets" || view === "links") {
      // Secrets and Links are list surfaces like Notes: show the tree first;
      // tapping an item flips to detail via the onOpenSecret/onOpenLink callback.
      setMobilePane("list");
    } else {
      setMobilePane("detail");
    }
  }, [isMobile, view, activeNoteId, draftJournal]);

  // Keyboard inset tracking — lets the mobile editor toolbar ride above the
  // on-screen keyboard (Apple Notes-style) and gives the editor enough scroll
  // room that the tapped line lifts above the keyboard instead of hiding
  // behind it. Capacitor's Keyboard plugin runs with resize:"none" (see
  // apps/mobile/capacitor.config.ts), so the WebView never resizes and neither
  // env(keyboard-inset-*) nor visualViewport report the keyboard on native
  // iOS. The plugin instead fires window `keyboardWillShow`/`keyboardWillHide`
  // events carrying the height in CSS px, which we mirror onto the
  // --nk-keyboard-inset custom property the mobile CSS reads. On the mobile
  // web (PWA / browser) there's no native plugin, so visualViewport is the
  // source of truth there.
  useEffect(() => {
    if (!isMobile) return;
    const root = document.documentElement;
    const setInset = (px: number) => {
      const v = Math.max(0, Math.round(px));
      root.style.setProperty("--nk-keyboard-inset", `${v}px`);
      root.toggleAttribute("data-keyboard", v > 0);
    };
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const isNative = typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();

    if (isNative) {
      const onShow = (e: Event) => setInset((e as unknown as { keyboardHeight?: number }).keyboardHeight ?? 0);
      const onHide = () => setInset(0);
      window.addEventListener("keyboardWillShow", onShow);
      window.addEventListener("keyboardWillHide", onHide);
      return () => {
        window.removeEventListener("keyboardWillShow", onShow);
        window.removeEventListener("keyboardWillHide", onHide);
        setInset(0);
      };
    }

    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setInset(window.innerHeight - vv.height - vv.offsetTop);
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
      setInset(0);
    };
  }, [isMobile]);

  useVaultBoot({ setVault, setVaults, setVaultPhase, setVaultError });

  // Load per-vault settings whenever the active vault changes.
  useEffect(() => {
    if (!activeVaultId) {
      setActiveSettings(null);
      return;
    }
    let cancelled = false;
    vaultManagement
      .getVaultSettings(activeVaultId)
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
    void publishMyKeys().catch(() => { /* intentional noop — key publication is best-effort */ });
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

  useEffect(() => {
    return () => vaultEventStream.stop();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = "Notekit";
    let label: string | null = null;
    if (view === "notes") {
      label = draftJournal?.date ?? noteHeading;
    } else if (view === "calendar" || view === "tickets") {
      label = "Tasks";
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

  const resolvedTheme = useResolvedTheme(activeSettings?.theme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = resolvedTheme;
    // Cache so the inline <head> script paints this theme on the next load,
    // before React mounts — avoids the light-then-dark flash.
    try {
      localStorage.setItem("nk:theme", resolvedTheme);
    } catch {
      /* ignore */
    }
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [resolvedTheme]);

  useEffect(() => {
    applyEditorPrefs();
    applyAccent();
    applyAppearance();
  }, []);

  async function onVaultPicked() {
    setVaultPhase("ready");
    vaultManagement
      .listVaults()
      .then((res) => setVaults(res.vaults, res.activeId))
      .catch(() => { /* non-fatal */ });
    const pickedVault = useVaultStore.getState().vault;
    if (pickedVault) await bindVaultPersistence(pickedVault);
    // Wait for crypto before pull so encrypted items decrypt on first try.
    await bootstrapCrypto().catch(() => { /* intentional noop */ });
    await startSync();
    vaultEventStream.start();
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
        setView("calendar");
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

  // Secrets and Links render their own title header (with actions), so the
  // breadcrumb would just repeat it. Blank the crumb for them and drop the
  // breadcrumb row on desktop (it still appears on mobile / when collapsed
  // to carry the menu / expand buttons — but without the duplicate title).
  const viewOwnsTitle = view === "home";
  // The mobile appbar (nk-main-hd) is the screen-title bar for every surface
  // rendered in <main> — so it always needs a label, even for views that own
  // their title on desktop. `viewOwnsTitle` still gates whether the *desktop*
  // header renders at all (below), so populating this here is mobile-only in
  // effect.
  const crumbLabel =
    view === "notes"
      ? draftJournal
        ? draftJournal.date
        : (noteHeading ?? "—")
      : view === "graph"
        ? "Graph"
        : view === "calendar" || view === "tickets"
          ? "Tasks"
          : view === "secrets"
            ? "Secrets"
            : view === "links"
              ? "Links"
              : view === "home"
                ? "Home"
                : "Calendar";

  function exitMobileDetail() {
    setActive(null);
    setMobilePane("list");
  }

  function onMobileView(next: MainView) {
    setView(next);
    // Only Notes uses the list/detail split (tree → editor). Every other
    // surface renders full-screen in <main>, which is the "detail" pane — so
    // it must be "detail" or the CSS hides <main> and the screen goes blank.
    setMobilePane(next === "notes" ? "list" : "detail");
    setDrawerOpen(false);
  }

  // Home dashboard tiles/search navigate via a lightweight event so HomePane
  // (deep inside EditorPane) doesn't need nav callbacks threaded through.
  useEffect(() => {
    function onHomeNav(e: Event) {
      const view = (e as CustomEvent<{ view?: MainView }>).detail?.view;
      if (!view) return;
      setView(view);
      setMobilePane(view === "notes" ? "list" : "detail");
      setDrawerOpen(false);
    }
    window.addEventListener("nk:home-nav", onHomeNav);
    return () => window.removeEventListener("nk:home-nav", onHomeNav);
  }, []);

  return (
    <div
      className="nk"
      data-dir="studio"
      data-theme={resolvedTheme}
      data-desktop-mac={isDesktopMac ? "true" : undefined}
    >
      <div
        className="nk-app"
        data-mobile={isMobile ? "true" : undefined}
        data-view={view}
        data-mobile-pane={isMobile ? mobilePane : undefined}
        data-sidebar-collapsed={
          !isMobile && sidebarCollapsed ? "true" : undefined
        }
        data-zen={zenMode ? "true" : undefined}
        data-ai-open={!isMobile && !zenMode && aiOpen ? "true" : undefined}
        style={
          !isMobile && !zenMode
            ? {
                // sidebar | document | (optional) AI dock
                gridTemplateColumns: `${sidebarCollapsed ? 0 : sidebarWidth}px 1fr${
                  aiOpen ? ` ${aiWidth}px` : ""
                }`,
                transition: sidebarDragging ? "none" : undefined,
              }
            : undefined
        }
      >
        <Sidebar
          view={view}
          railSurface={railSurface}
          onView={(next) => {
            setRailSurface(next);
            if (next === "graph") {
              useLayoutStore.getState().openTab({ type: "graph" });
              setView("notes");
            } else if (next === "calendar" || next === "tickets") {
              useLayoutStore.getState().openTab({ type: "tasks" });
              setView("notes");
            } else {
              setView(next);
            }
          }}
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
          onOpenSecret={isMobile ? () => setMobilePane("detail") : undefined}
          onOpenLink={isMobile ? () => setMobilePane("detail") : undefined}
        />

        {!isMobile && !sidebarCollapsed && !zenMode && (
          <div
            className="nk-sidebar-resizer"
            style={{ left: sidebarWidth }}
            onMouseDown={onSidebarDragStart}
          />
        )}

        <main className="nk-main">
          <MainAppBar
            isMobile={isMobile}
            view={view}
            sidebarCollapsed={sidebarCollapsed}
            viewOwnsTitle={viewOwnsTitle}
            mobilePane={mobilePane}
            crumbLabel={crumbLabel}
            activeSettings={activeSettings}
            onExpandSidebar={() => setSidebarCollapsed(false)}
            onExitMobileDetail={exitMobileDetail}
            onOpenMenu={() => setDrawerOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
          />
          <RecoveryBackupNudge />
          <EncryptedSkippedBanner />
          {view === "home" && (
            <HomePane
              onNewNote={() => {
                const folder = activeSettings?.defaultFolder ?? null;
                const created = upsert({ title: "Untitled", body: "", folder });
                setView("notes");
                setMobilePane("detail");
                openNoteInLayout(created.id);
              }}
              onOpenNote={(id) => {
                setView("notes");
                setMobilePane("detail");
                openNoteInLayout(id);
              }}
              onToggleTicket={(id) => useTicketsStore.getState().setStatus(id, "done")}
            />
          )}
          {(view === "notes" || view === "secrets" || view === "links") && (
            <SplitPane
              node={layout}
              zenMode={zenMode}
              onZenToggle={() => setZenMode((z) => !z)}
              vimMode={vimMode}
              onVimToggle={() => setVimMode((v) => !v)}
              onHistoryClick={() => setHistoryOpen(true)}
            />
          )}
          {view === "graph" && <GraphView />}
          {(view === "calendar" || view === "tickets") && (
            <TasksView
              onOpenJournal={(ymd) => {
                openJournal(ymd);
                setView("notes");
              }}
              focusTicket={focusTicket}
              userName={user?.name ?? null}
            />
          )}
          {!zenMode && <AIAssistantFab />}
        </main>

        {/* AI assistant — a third dock column on desktop (with a left-edge
         * resizer), a full-screen overlay on mobile. */}
        {!zenMode && aiOpen && (
          <>
            {!isMobile && (
              <div
                className="nk-ai-resizer"
                style={{ right: aiWidth }}
                onMouseDown={onAiDragStart}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize AI panel"
              />
            )}
            <AIAssistantPanel
              onOpenAgents={() => setAgentsOpen(true)}
              refreshTick={aiSetupTick}
            />
          </>
        )}

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
      {isMobile && !zenMode && !aiOpen && !drawerOpen && (
        <MobileBottomNav
          view={view}
          onView={onMobileView}
          onOpenMenu={() => setDrawerOpen(true)}
        />
      )}
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
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {isMobile && settingsOpen && (
        <MobileSettings
          user={user}
          onSignOut={onSignOut}
          onClose={() => setSettingsOpen(false)}
          onOpenAgents={() => setAgentsOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenTokens={() => setTokensOpen(true)}
          onOpenDevices={() => setDevicesOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          vimMode={vimMode}
          onToggleVim={() => setVimMode((v) => !v)}
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
      <AppModals
        agentsOpen={agentsOpen}
        onCloseAgents={() => setAgentsOpen(false)}
        focusAgent={focusAgent}
        tokensOpen={tokensOpen}
        onCloseTokens={() => setTokensOpen(false)}
        devicesOpen={devicesOpen}
        onCloseDevices={() => setDevicesOpen(false)}
        notificationsOpen={notificationsOpen}
        onCloseNotifications={() => setNotificationsOpen(false)}
        historyOpen={historyOpen}
        onCloseHistory={() => setHistoryOpen(false)}
        notePath={view === "notes" && note ? note.path : undefined}
        showNoteHistoryHint={view === "notes" && !!note}
      />

      <FirstEncryptDialog />
      <ShareDialog />
      <RecoveryBackupSheet />
    </div>
  );
}

