// MCP prompts — surface in clients as `/notekit:*` slash commands.
//
// A prompt isn't a tool; it returns a *messages array* that the client
// sends back to the LLM as if the user had typed it. We use this to:
//
//   - bootstrap a daily-journal flow (`/notekit:daily`)
//   - capture loose text into the inbox (`/notekit:capture <text>`)
//   - kick off ticket triage (`/notekit:ticket-triage`)
//
// Each prompt is intentionally short and tool-aware — it references the
// MCP tools the agent should use to satisfy the request, so a fresh
// session lands on the right loop without prior context.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveProjectContext } from "../lib/project.js";

export function registerNoteKitPrompts(server: McpServer): void {
  server.registerPrompt(
    "notekit:daily",
    {
      title: "NoteKit · Daily note",
      description:
        "Open or create today's daily note in the active project, then guide the user through a brief journal flow.",
    },
    async () => {
      const ctx = resolveProjectContext();
      const today = new Date().toISOString().slice(0, 10);
      const scopeLine = ctx
        ? `The active project is \`${ctx.project}\`. The daily note lives at \`projects/${ctx.project}/notes/daily-${today}.md\`.`
        : `No project is active. The daily note lives at \`notes/daily-${today}.md\` (top-level).`;
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Please open my NoteKit daily note for ${today}.`,
                "",
                scopeLine,
                "",
                "Steps:",
                "1. Use `notes_search` (query: `daily-" + today + "`) to find the existing daily note for today.",
                "2. If it exists, call `notes_read` and summarize what I already wrote.",
                "3. If it doesn't exist yet, call `notes_create` with title `Daily " + today + "` and a body that has these sections: `## Plan`, `## Doing`, `## Done`, `## Notes`.",
                "4. Then ask me what I want to add today, and use `notes_append` to record it.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "notekit:capture",
    {
      title: "NoteKit · Capture to inbox",
      description: "Quickly capture text into the inbox for later triage.",
      argsSchema: {
        text: z.string().describe("The content to capture."),
        source: z.string().optional().describe("Optional source label (e.g. 'slack', 'meeting')."),
      },
    },
    async ({ text, source }) => {
      const ctx = resolveProjectContext();
      const where = ctx
        ? `\`projects/${ctx.project}/inbox/<today>.md\``
        : "`inbox/<today>.md`";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Capture this into my NoteKit inbox (${where}):`,
                "",
                "```",
                text,
                "```",
                "",
                `Use the \`inbox_append\` tool with the text above${source ? ` and source label \`${source}\`` : ""}. Confirm the file path you wrote to.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "notekit:ticket-triage",
    {
      title: "NoteKit · Ticket triage",
      description: "Walk through open tickets in the active project and propose next steps.",
    },
    async () => {
      const ctx = resolveProjectContext();
      const scopeLine = ctx
        ? `Scope to project \`${ctx.project}\`.`
        : "No project is active — triage globally.";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Triage my open NoteKit tickets.",
                "",
                scopeLine,
                "",
                "Steps:",
                "1. Call `tickets_list` with `status: 'todo'`. Read all results.",
                "2. Then call `tickets_list` with `status: 'in_progress'`.",
                "3. For each ticket, give a one-line status: blocker / unblocked / stale (no updates in >14 days) / fine.",
                "4. Propose 1–3 concrete next actions, naming the ticket path each refers to.",
                "5. Do NOT call `tickets_update` or `tickets_delete` without asking me first.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
