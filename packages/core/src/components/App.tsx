import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { NoteKitWordmark } from "./NoteKitLogo";
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
import { start as startSync } from "../lib/sync";
import { bootstrapCrypto } from "../lib/crypto-bootstrap";
import type { User } from "../types/user";
import { Editor, type EditorHandle } from "./Editor";
import { EditorToolbar } from "./EditorToolbar";
import { Sidebar } from "./Sidebar";
import { TicketsBoard } from "./TicketsBoard";
import { GraphView } from "./GraphView";
import { CalendarView } from "./CalendarView";
import { HistoryView } from "./HistoryView";
import { AgentsView } from "./AgentsView";
import { AccessTokensView } from "./AccessTokensView";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusTicket, setFocusTicket] = useState<{ id: string; seq: number } | null>(null);
  const [focusAgent, setFocusAgent] = useState<{ slug: string; seq: number } | null>(null);
  const editorRef = useRef<EditorHandle>(null);

  const noteHeading = note ? noteTitle(note) : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
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
          await startSync();
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

  // Resolve `auto` theme to a concrete value using the OS preference.
  const resolvedTheme =
    activeSettings?.theme === "light"
      ? "light"
      : activeSettings?.theme === "dark"
        ? "dark"
        : typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";

  async function onVaultPicked() {
    setVaultPhase("ready");
    // Populate the full vault list so the switcher is ready right away.
    listVaults()
      .then((res) => setVaults(res.vaults, res.activeId))
      .catch(() => {
        /* Non-fatal; the switcher will lazy-load. */
      });
    await startSync();
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
  const titlebarSub =
    view === "tickets"
      ? "Tickets"
      : view === "graph"
        ? "Graph"
        : view === "calendar"
          ? "Calendar"
          : view === "secrets"
            ? "Secrets"
            : view === "links"
              ? "Links"
              : draftJournal
                ? draftJournal.date
                : noteHeading || vaultLabel;

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

  return (
    <div className="nk" data-dir="studio" data-theme={resolvedTheme}>
      <div className="nk-app">
        <header className="nk-titlebar">
          <span className="nk-titlebar-title">
            <NoteKitWordmark />
          </span>
          <span className="nk-titlebar-sub">{titlebarSub}</span>
        </header>

        <Sidebar
          view={view}
          onView={setView}
          user={user}
          onSignOut={onSignOut}
          onOpenAgents={() => setAgentsOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenTokens={() => setTokensOpen(true)}
        />

        <main className="nk-main">
          <header className="nk-main-hd">
            <div className="nk-crumbs">
              <span>vault</span>
              <span className="sep">/</span>
              <span className="last">{crumbLabel}</span>
            </div>
            {view === "notes" && (
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
                    <p>Pick a note, or press ⌘N for a new one.</p>
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
          <span>
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
          </span>
          <span>
            {view === "notes" && note ? `${note.body.length} chars` : ""}
          </span>
        </footer>
      </div>
      {vaultPhase === "needs-pick" && (
        <VaultPicker onPicked={onVaultPicked} />
      )}
      {view === "secrets" && vaultPhase === "ready" && cryptoPhase === "needs-setup" && (
        <VaultSetup />
      )}
      {view === "secrets" && vaultPhase === "ready" && cryptoPhase === "needs-pair" && (
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
    </div>
  );
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
    return `Synced ${new Date(lastSyncedAt).toLocaleTimeString()} · ${vaultLabel}`;
  }
  return vaultLabel;
}
