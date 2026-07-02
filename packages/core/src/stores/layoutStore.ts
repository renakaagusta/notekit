import { create } from "zustand";
import { useNotesStore } from "./notesStore";

let _seq = 0;
const uid = () => `p${++_seq}`;

export type PaneLeaf = {
  type: "leaf";
  id: string;
  tabs: string[];
  activeTab: string | null;
  outlineOpen: boolean;
};

export type PaneSplit = {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  ratio: number; // 0–1, fraction allocated to child `a`
  a: PaneNode;
  b: PaneNode;
};

export type PaneNode = PaneLeaf | PaneSplit;

export function findLeaf(node: PaneNode, id: string): PaneLeaf | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.a, id) ?? findLeaf(node.b, id);
}

function findParent(
  node: PaneNode,
  childId: string,
): { parent: PaneSplit; side: "a" | "b" } | null {
  if (node.type === "leaf") return null;
  if (node.a.id === childId) return { parent: node, side: "a" };
  if (node.b.id === childId) return { parent: node, side: "b" };
  return findParent(node.a, childId) ?? findParent(node.b, childId);
}

function mapLeaf(
  node: PaneNode,
  id: string,
  fn: (leaf: PaneLeaf) => PaneLeaf,
): PaneNode {
  if (node.type === "leaf") return node.id === id ? fn(node) : node;
  return {
    ...node,
    a: mapLeaf(node.a, id, fn),
    b: mapLeaf(node.b, id, fn),
  };
}

function replaceNode(
  tree: PaneNode,
  targetId: string,
  next: PaneNode,
): PaneNode {
  if (tree.id === targetId) return next;
  if (tree.type === "leaf") return tree;
  return {
    ...tree,
    a: replaceNode(tree.a, targetId, next),
    b: replaceNode(tree.b, targetId, next),
  };
}

function firstLeaf(node: PaneNode): PaneLeaf {
  if (node.type === "leaf") return node;
  return firstLeaf(node.a);
}

const initial: PaneLeaf = {
  type: "leaf",
  id: uid(),
  tabs: [],
  activeTab: null,
  outlineOpen: false,
};

interface LayoutState {
  layout: PaneNode;
  activePaneId: string;
  openNote(noteId: string, paneId?: string): void;
  closeTab(noteId: string, paneId: string): void;
  activateTab(noteId: string, paneId: string): void;
  setActivePaneId(paneId: string): void;
  splitPane(paneId: string, direction: "horizontal" | "vertical"): void;
  closePane(paneId: string): void;
  setRatio(splitId: string, ratio: number): void;
  toggleOutline(paneId: string): void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layout: initial,
  activePaneId: initial.id,

  openNote(noteId, paneId) {
    const targetId = paneId ?? get().activePaneId;
    set((s) => ({
      layout: mapLeaf(s.layout, targetId, (leaf) => ({
        ...leaf,
        tabs: leaf.tabs.includes(noteId) ? leaf.tabs : [...leaf.tabs, noteId],
        activeTab: noteId,
      })),
      activePaneId: targetId,
    }));
    useNotesStore.getState().setActive(noteId);
  },

  closeTab(noteId, paneId) {
    set((s) => ({
      layout: mapLeaf(s.layout, paneId, (leaf) => {
        const idx = leaf.tabs.indexOf(noteId);
        const tabs = leaf.tabs.filter((t) => t !== noteId);
        const activeTab =
          leaf.activeTab === noteId
            ? (tabs[Math.min(idx, tabs.length - 1)] ?? null)
            : leaf.activeTab;
        return { ...leaf, tabs, activeTab };
      }),
    }));
    if (get().activePaneId === paneId) {
      const leaf = findLeaf(get().layout, paneId);
      useNotesStore.getState().setActive(leaf?.activeTab ?? null);
    }
  },

  activateTab(noteId, paneId) {
    set((s) => ({
      layout: mapLeaf(s.layout, paneId, (leaf) => ({
        ...leaf,
        activeTab: noteId,
      })),
      activePaneId: paneId,
    }));
    useNotesStore.getState().setActive(noteId);
  },

  setActivePaneId(paneId) {
    set({ activePaneId: paneId });
    const leaf = findLeaf(get().layout, paneId);
    if (leaf?.activeTab) {
      useNotesStore.getState().setActive(leaf.activeTab);
    }
  },

  splitPane(paneId, direction) {
    const leaf = findLeaf(get().layout, paneId);
    if (!leaf) return;
    const newLeaf: PaneLeaf = {
      type: "leaf",
      id: uid(),
      tabs: [],
      activeTab: null,
      outlineOpen: false,
    };
    const split: PaneSplit = {
      type: "split",
      id: uid(),
      direction,
      ratio: 0.5,
      a: leaf,
      b: newLeaf,
    };
    set((s) => ({
      layout: replaceNode(s.layout, paneId, split),
      activePaneId: newLeaf.id,
    }));
  },

  closePane(paneId) {
    const { layout, activePaneId } = get();
    if (layout.type === "leaf") return;
    const result = findParent(layout, paneId);
    if (!result) return;
    const sibling =
      result.side === "a" ? result.parent.b : result.parent.a;
    const newLayout = replaceNode(layout, result.parent.id, sibling);
    const newActiveId =
      activePaneId === paneId ? firstLeaf(sibling).id : activePaneId;
    set({ layout: newLayout, activePaneId: newActiveId });
  },

  setRatio(splitId, ratio) {
    const clamp = (v: number) => Math.max(0.1, Math.min(0.9, v));
    set((s) => {
      function update(node: PaneNode): PaneNode {
        if (node.type === "leaf") return node;
        if (node.id === splitId) return { ...node, ratio: clamp(ratio) };
        return { ...node, a: update(node.a), b: update(node.b) };
      }
      return { layout: update(s.layout) };
    });
  },

  toggleOutline(paneId) {
    set((s) => ({
      layout: mapLeaf(s.layout, paneId, (leaf) => ({
        ...leaf,
        outlineOpen: !leaf.outlineOpen,
      })),
    }));
  },
}));
