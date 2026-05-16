import { useEffect, useMemo, useRef, useState } from "react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";
import {
  searchAgents,
  searchCommits,
  searchNotes,
  searchTickets,
  type SearchHit,
  type SearchKind,
} from "../lib/search";
import { listAgents, type AgentProfile } from "../lib/agents-api";
import { listCommits, type VaultCommit } from "../lib/vault-api";

interface SearchPaletteProps {
  open: boolean;
  onClose(): void;
  onSelect(hit: SearchHit): void;
}

const GROUP_ORDER: SearchKind[] = [
  "journal",
  "note",
  "ticket",
  "agent",
  "commit",
];

const GROUP_LABEL: Record<SearchKind, string> = {
  journal: "Journals",
  note: "Notes",
  ticket: "Tickets",
  agent: "Agents",
  commit: "Commits",
};

const GROUP_GLYPH: Record<SearchKind, string> = {
  journal: "🗓",
  note: "▤",
  ticket: "◇",
  agent: "◎",
  commit: "⌥",
};

export function SearchPalette({ open, onClose, onSelect }: SearchPaletteProps) {
  const notes = useNotesStore((s) => s.notes);
  const tickets = useTicketsStore((s) => s.tickets);
  const vaultReady = useVaultStore((s) => s.phase === "ready");

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [agents, setAgents] = useState<AgentProfile[] | null>(null);
  const [commits, setCommits] = useState<VaultCommit[] | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    setRemoteError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !vaultReady) return;
    let cancelled = false;
    setAgents(null);
    setCommits(null);
    (async () => {
      try {
        const [a, c] = await Promise.all([
          listAgents().catch(() => ({ agents: [] as AgentProfile[] })),
          listCommits(undefined, 300).catch(() => ({ commits: [] as VaultCommit[] })),
        ]);
        if (cancelled) return;
        setAgents(a.agents);
        setCommits(c.commits);
      } catch (e) {
        if (!cancelled) setRemoteError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vaultReady]);

  const notesList = useMemo(() => Object.values(notes), [notes]);
  const ticketsList = useMemo(() => Object.values(tickets), [tickets]);

  const grouped = useMemo<Record<SearchKind, SearchHit[]>>(() => {
    const out: Record<SearchKind, SearchHit[]> = {
      journal: [],
      note: [],
      ticket: [],
      agent: [],
      commit: [],
    };
    if (!query.trim()) return out;
    const all: SearchHit[] = [
      ...searchNotes(query, notesList),
      ...searchTickets(query, ticketsList),
      ...(agents ? searchAgents(query, agents) : []),
      ...(commits ? searchCommits(query, commits) : []),
    ];
    for (const hit of all) out[hit.kind].push(hit);
    return out;
  }, [query, notesList, ticketsList, agents, commits]);

  const flat = useMemo(() => {
    const arr: SearchHit[] = [];
    for (const k of GROUP_ORDER) arr.push(...grouped[k]);
    return arr;
  }, [grouped]);

  useEffect(() => {
    if (cursor >= flat.length) setCursor(0);
  }, [flat.length, cursor]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cursor="${cursor}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (flat.length === 0 ? 0 : (c + 1) % flat.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) =>
        flat.length === 0 ? 0 : (c - 1 + flat.length) % flat.length,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[cursor];
      if (hit) {
        onSelect(hit);
        onClose();
      }
    }
  }

  if (!open) return null;

  const remoteLoading =
    vaultReady && (agents === null || commits === null);
  const totalHits = flat.length;

  return (
    <div className="nk-modal-backdrop" onClick={onClose}>
      <div
        className="nk-modal nk-search"
        role="dialog"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="nk-search-hd">
          <input
            ref={inputRef}
            className="nk-search-input"
            placeholder="Search notes, tickets, agents, commits…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="nk-iconbtn"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="nk-search-body" ref={listRef}>
          {query.trim() === "" && (
            <div className="nk-search-empty">
              Type to search across notes, journals, tickets, agents, and commits.
            </div>
          )}

          {query.trim() !== "" && totalHits === 0 && !remoteLoading && (
            <div className="nk-search-empty">No matches.</div>
          )}

          {GROUP_ORDER.map((kind) => {
            const hits = grouped[kind];
            if (hits.length === 0) return null;
            return (
              <section key={kind} className="nk-search-group">
                <header className="nk-search-group-hd">
                  <span aria-hidden>{GROUP_GLYPH[kind]}</span>
                  <span>{GROUP_LABEL[kind]}</span>
                  <span className="nk-search-group-count">{hits.length}</span>
                </header>
                <ul className="nk-search-list">
                  {hits.map((hit) => {
                    const flatIdx = flat.indexOf(hit);
                    const active = flatIdx === cursor;
                    return (
                      <li
                        key={hit.key}
                        data-cursor={flatIdx}
                        className={
                          "nk-search-row" + (active ? " is-active" : "")
                        }
                        onMouseEnter={() => setCursor(flatIdx)}
                        onClick={() => {
                          onSelect(hit);
                          onClose();
                        }}
                      >
                        <div className="nk-search-row-title">{hit.title}</div>
                        {hit.subtitle && (
                          <div className="nk-search-row-sub">{hit.subtitle}</div>
                        )}
                        {hit.snippet && (
                          <div className="nk-search-row-snip">{hit.snippet}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {remoteLoading && query.trim() !== "" && (
            <div className="nk-search-loading">Loading remote sources…</div>
          )}
          {remoteError && (
            <div className="nk-search-error">Remote search failed: {remoteError}</div>
          )}
        </div>

        <footer className="nk-search-ft">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  );
}
