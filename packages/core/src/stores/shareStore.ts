/**
 * Drives the share dialog. Any surface (note toolbar, ticket/link menu) calls
 * `open({kind, id, title})`; the root-mounted <ShareDialog/> renders for it.
 * Mirrors the e2ee-onboarding store's request pattern.
 */
import { create } from "zustand";
import type { EncryptedItemKind } from "../lib/crypto/item-crypto";

export interface ShareTarget {
  kind: EncryptedItemKind;
  id: string;
  title: string;
}

interface ShareState {
  target: ShareTarget | null;
  open(target: ShareTarget): void;
  close(): void;
}

export const useShareStore = create<ShareState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
