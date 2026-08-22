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
  generateText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { DEFAULT_AGENT_MODEL, type AgentProvider } from "../domain/entities/agent";
import type { DeviceIdentity } from "./crypto/device-key";
import { getSecret } from "./secrets-vault";


/** Multimodal message content: plain text, or an ordered list of text/image
 *  parts (images as data: URLs or https URLs) for vision-capable models. */
export type MessageContent =
  | string
  | ({ type: "text"; text: string } | { type: "image"; image: string })[];

export interface AssistantMessage {
  role: "user" | "assistant";
  content: MessageContent;
}

export interface StreamAssistantOptions {
  device: DeviceIdentity;
  /** Vault secret name holding this profile's API key (see agentKeySecretName). */
  keySecretName: string;
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
  /** Fired when tools were dropped because the model/endpoint rejected them. */
  onToolsUnsupported?: () => void;
}

export interface StreamAssistantResult {
  /** The full assembled assistant text. */
  text: string;
  /** True if tools were dropped mid-run (model rejected them). */
  toolsDropped: boolean;
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

  const key = await getSecret(opts.keySecretName, opts.device);
  if (!key) {
    throw new Error("API key profil ini belum diisi. Buka profil di pengaturan AI.");
  }

  if (provider === "openai-compatible") {
    const baseURL = opts.baseUrl?.trim();
    if (!baseURL) {
      throw new Error("Base URL kosong. Isi Base URL di profil ini.");
    }
    if (!opts.model) throw new Error("Model belum dipilih untuk profil ini.");
    const openai = createOpenAI({ apiKey: key, baseURL });
    return openai.chat(opts.model);
  }

  const anthropic = createAnthropic({
    apiKey: key,
    headers: { "anthropic-dangerous-direct-browser-access": "true" },
  });
  return anthropic(opts.model ?? DEFAULT_AGENT_MODEL);
}

/** True when an error looks like the provider rejecting the tool payload. */
function isToolFormatError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /tool/i.test(msg);
}

// eslint-disable-next-line max-lines-per-function -- streaming assistant with retry logic and tool-degradation path cannot be split without losing context
export async function streamAssistant(
  opts: StreamAssistantOptions,
): Promise<StreamAssistantResult> {
  const model = await resolveModel(opts);

  let text = "";

  // A single pass. `useTools` lets us retry without tools if the endpoint
  // rejects them (some OpenAI-compatible models, e.g. MiniMax-M3 via 9router,
  // don't accept the tool schema).
  // eslint-disable-next-line complexity -- streaming loop must handle all AI SDK event types in a single switch
  async function pass(useTools: boolean): Promise<void> {
    text = "";
    const result = streamText({
      model,
      system: opts.system,
      // Fresh copy per pass — the SDK may append tool/step messages, which
      // would taint a tools-off retry and trip "invalid tool type" again.
      messages: opts.messages.map((m) => ({ ...m })) as ModelMessage[],
      tools: useTools ? opts.tools : undefined,
      stopWhen: useTools && opts.tools ? stepCountIs(opts.maxSteps ?? 8) : undefined,
      abortSignal: opts.signal,
    });

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
  }

  let toolsDropped = false;
  try {
    await pass(!!opts.tools);
  } catch (err) {
    // If the model rejected the tools (and nothing was streamed yet), degrade
    // gracefully to a plain-chat answer rather than a hard error. The retry is
    // best-effort — some endpoints lock out briefly after an error.
    if (opts.tools && !text && isToolFormatError(err)) {
      toolsDropped = true;
      opts.onToolsUnsupported?.();
      try {
        await pass(false);
      } catch {
        /* fall through to the non-stream attempt below */
      }
    } else {
      throw err;
    }
  }

  // Some OpenAI-compatible models (e.g. MiniMax-M3 via 9router) yield nothing
  // over SSE. If streaming produced no text, try a single-shot generate.
  if (!text.trim()) {
    try {
      const g = await generateText({
        model,
        system: opts.system,
        messages: opts.messages.map((m) => ({ ...m })) as ModelMessage[],
      });
      if (g.text) {
        text = g.text;
        opts.onDelta?.(g.text);
      }
    } catch {
      /* endpoint incompatible with a plain generate too */
    }
  }

  // Nothing worked — surface a clean, actionable message instead of raw JSON.
  if (!text.trim()) {
    throw new Error(
      "Model tak memberi jawaban — kemungkinan tak kompatibel dengan endpoint ini. Coba model lain (mis. MiniMax-M2.1).",
    );
  }

  return { text, toolsDropped };
}
