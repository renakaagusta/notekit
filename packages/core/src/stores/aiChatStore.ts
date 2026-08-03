/**
 * State for the in-app AI assistant panel.
 *
 * Deliberately kept as PURE state + low-level mutators — no imports of the AI
 * SDK, the vault, or the crypto device. The panel component orchestrates a
 * turn (gather device + selected agent + note context, call `streamAssistant`,
 * pipe deltas back via `appendDelta`). That keeps this store trivially
 * testable and free of circular deps.
 *
 * Only the lightweight *preferences* (`selectedAgentSlug`, `includeNoteContext`)
 * persist to localStorage. The transcript itself is in-memory only — note
 * content must never land in plaintext storage, per NoteKit's E2EE stance.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Assistant message still receiving stream deltas. */
  pending?: boolean;
  /** Human-readable tool activity lines shown under the message (phase 2). */
  toolNotes?: string[];
}

/** A vault-mutating action the assistant proposed, awaiting user approval. */
export interface PendingApproval {
  id: string;
  toolName: string;
  /** One-line human summary, e.g. `Create note "Ideas"`. */
  summary: string;
  /** Raw tool input, surfaced for transparency. */
  input: unknown;
}

interface AIChatState {
  open: boolean;
  selectedAgentSlug: string | null;
  /** Include the active note as context in the next turn. */
  includeNoteContext: boolean;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  pendingApproval: PendingApproval | null;

  toggle(): void;
  setOpen(open: boolean): void;
  selectAgent(slug: string | null): void;
  setIncludeNoteContext(v: boolean): void;

  pushUser(content: string): void;
  /** Create an empty assistant message and return its id for streaming. */
  startAssistant(): string;
  appendDelta(id: string, delta: string): void;
  addToolNote(id: string, note: string): void;
  finishAssistant(id: string): void;

  setStreaming(v: boolean): void;
  setError(e: string | null): void;
  setPendingApproval(p: PendingApproval | null): void;
  clear(): void;
}

export const useAIChatStore = create<AIChatState>()(
  persist(
    immer<AIChatState>((set) => ({
      open: false,
      selectedAgentSlug: null,
      includeNoteContext: true,
      messages: [],
      streaming: false,
      error: null,
      pendingApproval: null,

      toggle() {
        set((s) => {
          s.open = !s.open;
        });
      },
      setOpen(open) {
        set((s) => {
          s.open = open;
        });
      },
      selectAgent(slug) {
        set((s) => {
          s.selectedAgentSlug = slug;
        });
      },
      setIncludeNoteContext(v) {
        set((s) => {
          s.includeNoteContext = v;
        });
      },

      pushUser(content) {
        set((s) => {
          s.messages.push({ id: nanoid(), role: "user", content });
          s.error = null;
        });
      },
      startAssistant() {
        const id = nanoid();
        set((s) => {
          s.messages.push({ id, role: "assistant", content: "", pending: true });
        });
        return id;
      },
      appendDelta(id, delta) {
        set((s) => {
          const m = s.messages.find((x) => x.id === id);
          if (m) m.content += delta;
        });
      },
      addToolNote(id, note) {
        set((s) => {
          const m = s.messages.find((x) => x.id === id);
          if (m) (m.toolNotes ??= []).push(note);
        });
      },
      finishAssistant(id) {
        set((s) => {
          const m = s.messages.find((x) => x.id === id);
          if (m) m.pending = false;
        });
      },

      setStreaming(v) {
        set((s) => {
          s.streaming = v;
        });
      },
      setError(e) {
        set((s) => {
          s.error = e;
        });
      },
      setPendingApproval(p) {
        set((s) => {
          s.pendingApproval = p;
        });
      },
      clear() {
        set((s) => {
          s.messages = [];
          s.error = null;
          s.pendingApproval = null;
        });
      },
    })),
    {
      name: "nk:ai-chat",
      storage: createJSONStorage(() => localStorage),
      // Persist only lightweight prefs — never the transcript (E2EE).
      partialize: (state) => ({
        selectedAgentSlug: state.selectedAgentSlug,
        includeNoteContext: state.includeNoteContext,
      }),
    },
  ),
);
