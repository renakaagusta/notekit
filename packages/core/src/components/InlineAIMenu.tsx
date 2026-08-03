import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import type { DeviceIdentity } from "../lib/crypto/device-key";
import { streamAssistant } from "../lib/ai-agent";

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
  model: string;
  sel: InlineSelection;
  onClose(): void;
}

type Preset = { id: string; label: string; build(text: string): string; append?: boolean };

const PRESETS: Preset[] = [
  {
    id: "rewrite",
    label: "Tulis ulang",
    build: (t) =>
      `Tulis ulang teks berikut agar lebih jelas dan ringkas tanpa mengubah maknanya. Balas HANYA teks hasilnya, tanpa penjelasan atau tanda kutip:\n\n${t}`,
  },
  {
    id: "summarize",
    label: "Ringkas",
    build: (t) =>
      `Ringkas teks berikut menjadi poin-poin singkat. Balas hanya ringkasannya:\n\n${t}`,
  },
  {
    id: "continue",
    label: "Lanjutkan",
    append: true,
    build: (t) =>
      `Lanjutkan tulisan berikut secara natural dengan gaya yang sama. Balas hanya kelanjutannya:\n\n${t}`,
  },
  {
    id: "grammar",
    label: "Perbaiki tata bahasa",
    build: (t) =>
      `Perbaiki ejaan dan tata bahasa teks berikut tanpa mengubah gaya atau makna. Balas HANYA teks hasilnya:\n\n${t}`,
  },
];

const SYSTEM =
  "Kamu editor teks. Balas HANYA dengan teks hasil yang diminta — tanpa basa-basi, " +
  "tanpa tanda kutip pembungkus, tanpa penjelasan.";

export function InlineAIMenu({ editor, device, model, sel, onClose }: Props) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setBusy(true);
    setError(null);
    try {
      const { text } = await streamAssistant({
        device,
        model,
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
        <Sparkles size={13} aria-hidden /> AI · {sel.text.length} karakter terpilih
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
          placeholder="Perintah bebas… (mis. terjemahkan ke Inggris)"
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
            {p.label}
          </button>
        ))}
      </div>
      {busy && (
        <div className="nk-inline-ai-status">
          <Loader2 size={13} className="nk-ai-spin" aria-hidden /> Menulis…
        </div>
      )}
      {error && <div className="nk-inline-ai-error">{error}</div>}
    </div>,
    document.body,
  );
}
