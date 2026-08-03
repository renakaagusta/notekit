import { useCallback, useRef } from "react";
import type { PaneNode, PaneSplit, LayoutState } from "../stores/layoutStore";
import { useLayoutStore } from "../stores/layoutStore";
import { EditorPane } from "./EditorPane";

const selectSetRatio = (s: LayoutState) => s.setRatio;

interface SplitPaneProps {
  node: PaneNode;
  zenMode: boolean;
  onZenToggle: () => void;
  vimMode: boolean;
  onVimToggle: () => void;
  onHistoryClick: () => void;
}

export function SplitPane(props: SplitPaneProps) {
  const { node, ...rest } = props;
  if (node.type === "leaf") {
    return <EditorPane paneId={node.id} {...rest} />;
  }
  return <SplitView split={node} {...rest} />;
}

function SplitView({
  split,
  ...rest
}: { split: PaneSplit } & Omit<SplitPaneProps, "node">) {
  const setRatio = useLayoutStore(selectSetRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const isH = split.direction === "horizontal";
      const rect = container.getBoundingClientRect();

      function onMove(ev: MouseEvent) {
        const pos = isH ? ev.clientX - rect.left : ev.clientY - rect.top;
        const size = isH ? rect.width : rect.height;
        setRatio(split.id, pos / size);
      }

      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [split.id, split.direction, setRatio],
  );

  const isH = split.direction === "horizontal";

  return (
    <div
      ref={containerRef}
      className={`nk-split nk-split--${split.direction}`}
    >
      <div
        className="nk-split-child"
        style={isH ? { width: `${split.ratio * 100}%` } : { height: `${split.ratio * 100}%` }}
      >
        <SplitPane node={split.a} {...rest} />
      </div>
      <div
        className={`nk-split-divider nk-split-divider--${split.direction}`}
        onMouseDown={onDividerMouseDown}
      />
      <div className="nk-split-child nk-split-child--fill">
        <SplitPane node={split.b} {...rest} />
      </div>
    </div>
  );
}
