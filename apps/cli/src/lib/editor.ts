// Open $EDITOR (fallback: nano) on a temp file containing `seed`, wait for the
// editor to exit, and return the new contents. Used by `note edit`, `ticket new`
// (when no body is provided), etc.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface OpenEditorOptions {
  /** Initial file contents. */
  seed?: string;
  /** Hint extension so editors pick syntax highlighting (default ".md"). */
  extension?: string;
}

export async function openEditor(opts: OpenEditorOptions = {}): Promise<string> {
  const ext = opts.extension ?? ".md";
  const editor = pickEditor();

  const file = path.join(tmpdir(), `notekit-${randomBytes(6).toString("hex")}${ext}`);
  await fs.writeFile(file, opts.seed ?? "", "utf8");

  try {
    await runEditor(editor, file);
    return await fs.readFile(file, "utf8");
  } finally {
    await fs.unlink(file).catch(() => undefined);
  }
}

function pickEditor(): string {
  return (
    process.env.VISUAL ||
    process.env.EDITOR ||
    (process.platform === "win32" ? "notepad" : "nano")
  );
}

function runEditor(editor: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Editors expect a real TTY — inherit all three streams.
    const child = spawn(editor, [file], { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`editor exited with code ${code}`));
    });
  });
}
