/**
 * In-app AI assistant — streaming client.
 *
 * Same trust model as `ai-client.ts`: the user's Anthropic key is decrypted
 * from the E2EE vault in memory and posted STRAIGHT to Anthropic from the
 * device (`anthropic-dangerous-direct-browser-access`). Nothing routes through
 * NoteKit's servers. Anthropic is the only provider here because OpenAI's API
 * doesn't return CORS headers, so a browser-direct call is blocked on the web
 * build — see the plan for the desktop-only path we may add later.
 *
 * Streaming is done via the Vercel AI SDK's `streamText`. We loop `fullStream`
 * (not just `textStream`) so a single code path handles text deltas AND tool
 * calls once agentic tools land — the caller wires up per-event callbacks.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  streamText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { getSecret } from "./secrets-vault";
import type { DeviceIdentity } from "./crypto/device-key";
import { DEFAULT_AGENT_MODEL, type AgentProvider } from "./agents-api";

/** Vault secret name holding the key for each provider family. */
export const PROVIDER_KEY_NAME: Record<AgentProvider, string> = {
  anthropic: "anthropic",
  "openai-compatible": "openai-compatible",
};

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamAssistantOptions {
  device: DeviceIdentity;
  /** API family. Defaults to anthropic. */
  provider?: AgentProvider;
  /** Base URL for openai-compatible providers. */
  baseUrl?: string;
  /** Model id; falls back to the Anthropic default for anthropic only. */
  model?: string;
  /** Persona / instructions from the selected agent profile. */
  system?: string;
  /** Prior turns plus the new user message. */
  messages: AssistantMessage[];
  /** Agentic tools (phase 2). When present, the model may loop up to `maxSteps`. */
  tools?: ToolSet;
  maxSteps?: number;
  signal?: AbortSignal;
  /** Fired for each streamed text chunk. */
  onDelta?: (text: string) => void;
  /** Fired when the model decides to call a tool (phase 2). */
  onToolCall?: (call: { toolName: string; input: unknown; toolCallId: string }) => void;
}

export interface StreamAssistantResult {
  /** The full assembled assistant text. */
  text: string;
}

/**
 * Resolve the language model for the selected provider, binding the user's
 * decrypted key. Anthropic goes direct (with the browser-direct header);
 * openai-compatible hits any base URL that speaks the chat-completions API
 * (e.g. a self-hosted router), forcing `.chat()` since such endpoints may not
 * implement the newer Responses API.
 */
async function resolveModel(opts: StreamAssistantOptions): Promise<LanguageModel> {
  const provider: AgentProvider = opts.provider ?? "anthropic";

  if (provider === "openai-compatible") {
    const key = await getSecret(PROVIDER_KEY_NAME["openai-compatible"], opts.device);
    if (!key) {
      throw new Error(
        "Belum ada API key OpenAI-compatible. Simpan dulu di pengaturan AI.",
      );
    }
    const baseURL = opts.baseUrl?.trim();
    if (!baseURL) throw new Error("Base URL kosong untuk provider OpenAI-compatible.");
    if (!opts.model) throw new Error("Model belum dipilih untuk provider ini.");
    const openai = createOpenAI({ apiKey: key, baseURL });
    return openai.chat(opts.model);
  }

  const key = await getSecret(PROVIDER_KEY_NAME.anthropic, opts.device);
  if (!key) {
    throw new Error(
      "Belum ada Anthropic key. Simpan dulu di pengaturan AI sebelum memakai asisten.",
    );
  }
  const anthropic = createAnthropic({
    apiKey: key,
    headers: { "anthropic-dangerous-direct-browser-access": "true" },
  });
  return anthropic(opts.model ?? DEFAULT_AGENT_MODEL);
}

export async function streamAssistant(
  opts: StreamAssistantOptions,
): Promise<StreamAssistantResult> {
  const model = await resolveModel(opts);

  const result = streamText({
    model,
    system: opts.system,
    messages: opts.messages as ModelMessage[],
    tools: opts.tools,
    // Only bound the agent loop when tools are in play; a plain chat is one step.
    stopWhen: opts.tools ? stepCountIs(opts.maxSteps ?? 8) : undefined,
    abortSignal: opts.signal,
  });

  let text = "";
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta": {
        // AI SDK v6 names the chunk field `delta`; older builds used `textDelta`/`text`.
        const chunk =
          (part as { delta?: string }).delta ??
          (part as { text?: string }).text ??
          (part as { textDelta?: string }).textDelta ??
          "";
        if (chunk) {
          text += chunk;
          opts.onDelta?.(chunk);
        }
        break;
      }
      case "tool-call": {
        const call = part as unknown as {
          toolName: string;
          input?: unknown;
          args?: unknown;
          toolCallId: string;
        };
        opts.onToolCall?.({
          toolName: call.toolName,
          input: call.input ?? call.args,
          toolCallId: call.toolCallId,
        });
        break;
      }
      case "error":
        throw (part as { error: unknown }).error;
      default:
        break;
    }
  }

  return { text };
}
