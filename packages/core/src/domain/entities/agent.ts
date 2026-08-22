/** Read-only agents cannot run create/edit/delete tools from the assistant. */
export type AgentToolPermissions = "read-only" | "read-write";

/** Which API a profile talks to: Anthropic direct, or an OpenAI-compatible endpoint. */
export type AgentProvider = "anthropic" | "openai-compatible";

/** Default Anthropic model when a profile doesn't pin one. */
export const DEFAULT_AGENT_MODEL = "claude-3-5-haiku-latest";

/** Default persona used to pre-fill new profiles and as a chat fallback. */
export const DEFAULT_SYSTEM_PROMPT =
  "You are the AI assistant inside NoteKit, a local-first note app. " +
  "Answer concisely, clearly, and helpfully. When given note context, use it as a " +
  "reference. Use Markdown to format chat answers. When WRITING note content " +
  "(create_note/update_note), use Markdown (headings, tables, lists) plus simple inline " +
  "HTML for static rich text. For INTERACTIVE content (quiz, chart, simulation needing " +
  "JavaScript), put a self-contained HTML snippet inside an ```interactive fenced code " +
  "block — it runs safely in a sandboxed iframe where JS/CSS work. Write body-level HTML " +
  "with inline <style>/<script> only (no <!DOCTYPE>/<html>/<head>), self-contained with no " +
  "network access. Do NOT use a plain ```html fence for interactive content (it shows as " +
  "code text), and do NOT tell the user to save it as a file.";

/**
 * Vault secret name that holds a profile's API key. Keys live in the E2EE
 * secrets vault (encrypted) — never in the profile's plaintext JSON — keyed
 * per profile so each agent is self-contained.
 */
export function agentKeySecretName(slug: string): string {
  return `agentkey-${slug}`;
}

export interface AgentProfile {
  slug: string;
  name: string;
  /** Drives the agent's Gravatar lookup — register this email at
   *  https://gravatar.com to give the agent a profile picture. */
  email: string;
  description: string;
  createdAt: string;
  /** Emoji shown in the assistant's profile picker (git avatar stays Gravatar). */
  emoji?: string;
  /** Model id the in-app assistant uses for this profile. */
  model?: string;
  /** Persona / instructions injected as the chat system prompt. */
  systemPrompt?: string;
  /** Whether this profile may mutate the vault. Defaults to read-only. */
  toolPermissions?: AgentToolPermissions;
  /** API family. Defaults to anthropic. */
  provider?: AgentProvider;
  /** Base URL for openai-compatible providers (e.g. a self-hosted router). */
  baseUrl?: string;
}

/** Editable chat-persona fields, shared by create and update inputs. */
export interface AgentChatConfig {
  emoji?: string;
  model?: string;
  systemPrompt?: string;
  toolPermissions?: AgentToolPermissions;
  provider?: AgentProvider;
  baseUrl?: string;
}
