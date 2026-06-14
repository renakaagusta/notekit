// The NoteKit agent skill, bundled so `notekit mcp install claude-code` can
// drop it into ~/.claude/skills/notekit/SKILL.md. Source of truth lives here
// (committed copy at .claude/skills/notekit/SKILL.md for review). Keep the
// frontmatter Claude-Code-compatible: `name` + `description` only.

export const NOTEKIT_SKILL_MD = `---
name: notekit
description: Use the NoteKit MCP tools to read, search, and write the user's notes, tickets, and secrets in their git-backed (often end-to-end-encrypted) vault. Trigger whenever the user asks to find/create/update a note or ticket, capture a decision, track a task, or look something up in "my notes / my vault / NoteKit".
---

# NoteKit

NoteKit is a git-backed, end-to-end-encryptable personal vault of Markdown
**notes**, kanban **tickets**, **links**, and **secrets**. You interact with it
through the \`notekit_*\` / \`notes_*\` / \`tickets_*\` MCP tools (this server).
Everything you write is committed to the user's git repo and attributed to you.

## When to use which surface
- **notes** — durable knowledge: decisions, docs, meeting notes, references, anything the user will re-read.
- **tickets** — actionable work items with a status (todo/in_progress/blocked/done) and priority. Use for "track / remind / TODO" requests.
- **secrets** — encrypted key/value credentials. You can list names; you generally should NOT read secret values (treat them as opaque).
- **links** — saved URLs (bookmarks).

## Core workflow
1. **Search before you create.** Call \`notes_search\` (or \`tickets_list\`) first so you update the right item instead of making a duplicate.
2. **Read with the path.** \`notes_read\` returns frontmatter + body. Use paths returned by search.
3. **Create/update** with \`notes_create\` / \`notes_update\` / \`tickets_create\` / \`tickets_update\`. Keep the title meaningful; put structured fields (tags, status, priority, assignee) in their dedicated args, not buried in the body.
4. **Move work** by updating a ticket's \`status\` ("mark X done" → status \`done\`).

## End-to-end encryption — important
- The vault may be **E2EE**. The server handles crypto for you: encrypted notes are stored as opaque \`notes/<id>.md.age\` files, and **read/search return the decrypted plaintext** to you, **create/update encrypt automatically**. You don't manage keys.
- This only works if the server was started with the vault's recovery phrase (\`NOTEKIT_RECOVERY_PHRASE\`). If a tool reports a note is locked / can't be decrypted, tell the user to unlock the server — don't try to work around it.
- **Privacy:** decrypted note content enters this conversation. Treat the user's notes as sensitive; don't echo secrets or paste credentials into note bodies.

## Conventions
- Notes/tickets are Markdown with YAML frontmatter (\`title\`, \`tags\`, \`status\`, \`priority\`, timestamps). The tools own the frontmatter — pass fields as args.
- The first line of a note body is usually \`# Title\`. Keep bodies clean Markdown.
- Project scope: tools default to the active project when a \`.notekit\` marker is present; pass \`scope: "all"\` to search the whole vault.

## Don'ts
- Don't fabricate note/ticket contents — read first.
- Don't duplicate: search, then update.
- Don't store secrets in note bodies; use the secrets surface.
- Don't assume a write failed silently — the tools return the committed path; surface it to the user.

## CLI (alternative / for the user)
The same vault is reachable from the terminal via the \`notekit\` CLI
(\`notekit note new/list/read\`, \`notekit ticket ...\`, \`notekit vault unlock\`).
Mention it if the user wants to work outside the agent.
`;
