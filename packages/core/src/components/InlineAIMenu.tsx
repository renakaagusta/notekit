import type { Editor as TipTapEditor } from "@tiptap/react";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  listAgents,
  agentKeySecretName,
  DEFAULT_AGENT_MODEL,
  type AgentProfile,
} from "../adapters/driven/agents-api";
import { streamAssistant } from "../lib/ai-agent";
import type { DeviceIdentity } from "../lib/crypto/device-key";
import { useAIChatStore } from "../stores/aiChatStore";

export interface InlineSelection {
  from: number;
  to: number;
  text: string;
  x: number;
  y: number;
}

interface Props {
  editor: TipTapEditor;
  device: DeviceIdentity;
  model?: string;
  sel: InlineSelection;
  onClose(): void;
}

/** `id` doubles as the i18n key under `inlineAi.preset.*` for the button label. */
interface Preset { id: "rewrite" | "summarize" | "continue" | "grammar"; build(text: string): string; append?: boolean }

const PRESETS: Preset[] = [
  {
    id: "rewrite",
    build: (text) =>
      `Rewrite the following text to be clearer and more concise without changing its meaning. Reply with ONLY the result, no explanation or quotes:\n\n${text}`,
  },
  {
    id: "summarize",
    build: (text) =>
      `Summarize the following text into short bullet points. Reply with only the summary:\n\n${text}`,
  },
  {
    id: "continue",
    append: true,
    build: (text) =>
      `Continue the following writing naturally in the same style. Reply with only the continuation:\n\n${text}`,
  },
  {
    id: "grammar",
    build: (text) =>
      `Fix the spelling and grammar of the following text without changing its style or meaning. Reply with ONLY the result:\n\n${text}`,
  },
];

const SYSTEM =
  "You are a text editor. Reply with ONLY the requested result text — no preamble, " +
  "no wrapping quotes, no explanation. Keep the text in its original language.";

// eslint-disable-next-line max-lines-per-function -- large React component with presets, streaming, and portal rendering
export function InlineAIMenu({ editor, device, model: _model, sel, onClose }: Props) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedAgentSlug = useAIChatStore((s) => s.selectedAgentSlug);

  // Resolve the profile the assistant panel currently uses, so inline edits
  // run through the same provider/model/key as the chat.
  useEffect(() => {
    let cancelled = false;
    listAgents()
      .then((r) => {
        if (cancelled) return;
        setAgent(r.agents.find((a) => a.slug === selectedAgentSlug) ?? r.agents[0] ?? null);
      })
      .catch(() => { /* intentional noop */ });
    return () => {
      cancelled = true;
    };
  }, [selectedAgentSlug]);

  useEffect(() => {
    inputRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function run(prompt: string, append: boolean) {
    if (busy) return;
    if (!agent) {
      setError(t("ai.error.pickProfile"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { text } = await streamAssistant({
        device,
        keySecretName: agentKeySecretName(agent.slug),
        provider: agent.provider ?? "anthropic",
        baseUrl: agent.baseUrl,
        model: agent.model ?? DEFAULT_AGENT_MODEL,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      const out = text.trim();
      if (out) {
        if (append) {
          editor.chain().focus().insertContentAt(sel.to, "\n\n" + out).run();
        } else {
          editor.chain().focus().insertContentAt({ from: sel.from, to: sel.to }, out).run();
        }
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return createPortal(
    <div
      ref={ref}
      className="nk-inline-ai"
      style={{ position: "fixed", left: sel.x, top: sel.y + 6 }}
    >
      <div className="nk-inline-ai-hd">
        <Sparkles size={13} aria-hidden /> {t("inlineAi.header", { count: sel.text.length })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = instruction.trim();
          if (q) void run(`${q}\n\nTeks:\n${sel.text}`, false);
        }}
      >
        <input
          ref={inputRef}
          className="nk-inline-ai-input"
          placeholder={t("inlineAi.freeform")}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={busy}
        />
      </form>
      <div className="nk-inline-ai-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="nk-inline-ai-preset"
            disabled={busy}
            onClick={() => void run(p.build(sel.text), !!p.append)}
          >
            {t(`inlineAi.preset.${p.id}`)}
          </button>
        ))}
      </div>
      {busy && (
        <div className="nk-inline-ai-status">
          <Loader2 size={13} className="nk-ai-spin" aria-hidden /> {t("inlineAi.writing")}
        </div>
      )}
      {error && <div className="nk-inline-ai-error">{error}</div>}
    </div>,
    document.body,
  );
}
