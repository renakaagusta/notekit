import { Sparkles } from "lucide-react";
import { useAIChatStore } from "../stores/aiChatStore";

/**
 * Floating entry point for the AI assistant — a discreet ✨ button pinned to
 * the bottom-right of the editor area. It opens the docked assistant panel;
 * it hides itself while the panel is open so it never overlaps the panel's
 * own content. Power users can ignore it and toggle the panel by other means
 * later (command palette / shortcut); this is the discoverability nudge.
 */
export function AIAssistantFab() {
  const open = useAIChatStore((s) => s.open);
  const toggle = useAIChatStore((s) => s.toggle);

  if (open) return null;

  return (
    <button
      className="nk-ai-fab"
      onClick={toggle}
      title="Asisten AI"
      aria-label="Buka asisten AI"
    >
      <Sparkles size={18} aria-hidden />
    </button>
  );
}
