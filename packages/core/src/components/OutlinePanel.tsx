import { useEffect, useState } from "react";
import type { Editor as TipTapEditor } from "@tiptap/react";

interface Heading {
  level: number;
  text: string;
  pos: number;
}

interface Props {
  getEditor(): TipTapEditor | null;
  onClose(): void;
}

function extractHeadings(editor: TipTapEditor): Heading[] {
  const headings: Heading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headings.push({ level: node.attrs.level as number, text: node.textContent, pos });
    }
  });
  return headings;
}


export function OutlinePanel({ getEditor, onClose }: Props) {
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    const editor = getEditor();
    if (!editor) return;

    function update() { setHeadings(extractHeadings(editor!)); }
    update();
    editor.on("update", update);
    return () => { editor.off("update", update); };
  }, [getEditor]);

  function jumpTo(pos: number) {
    const editor = getEditor();
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();
  }

  return (
    <div className="nk-outline-panel">
      <div className="nk-outline-hd">
        <span>Outline</span>
        <button className="nk-iconbtn" aria-label="Close outline" onClick={onClose}>✕</button>
      </div>
      <div className="nk-outline-body">
        {headings.length === 0 ? (
          <p className="nk-outline-empty">No headings yet.</p>
        ) : (
          headings.map((h, i) => (
            <button
              key={i}
              className={`nk-outline-item nk-outline-h${h.level}`}
              onClick={() => jumpTo(h.pos)}
            >
              <span className="nk-outline-level">H{h.level}</span>
              <span className="nk-outline-text">{h.text || "(empty)"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
