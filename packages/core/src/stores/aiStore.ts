import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type AIProvider = "anthropic" | "openai" | "ollama" | "none";

interface AIState {
  provider: AIProvider;
  apiKey: string | null;
  model: string;
  setProvider(provider: AIProvider): void;
  setApiKey(key: string | null): void;
  setModel(model: string): void;
}

export const useAIStore = create<AIState>()(
  immer((set) => ({
    provider: "none",
    apiKey: null,
    model: "claude-opus-4-7",
    setProvider(provider) {
      set((state) => {
        state.provider = provider;
      });
    },
    setApiKey(apiKey) {
      set((state) => {
        state.apiKey = apiKey;
      });
    },
    setModel(model) {
      set((state) => {
        state.model = model;
      });
    },
  })),
);
