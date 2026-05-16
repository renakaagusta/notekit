/**
 * Browser-side AI client. Reads the user's BYO key from the encrypted vault,
 * then calls the provider directly (no relay through NoteKit's server). The
 * key never leaves the user's device in plaintext over our infra — it's
 * decrypted in memory and posted straight to the provider.
 */
import { getSecret } from "./secrets-vault";
import type { DeviceIdentity } from "./crypto/device-key";

export type AIProvider = "openai" | "anthropic";

export async function askAI(
  provider: AIProvider,
  prompt: string,
  device: DeviceIdentity,
): Promise<string> {
  const key = await getSecret(provider, device);
  if (!key) {
    throw new Error(`No ${provider} key stored. Save one in the AI panel first.`);
  }
  if (provider === "openai") return askOpenAI(key, prompt);
  return askAnthropic(key, prompt);
}

async function askOpenAI(key: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== "string") {
    throw new Error("OpenAI returned no content.");
  }
  return reply;
}

async function askAnthropic(key: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const reply = data.content
    ?.filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (!reply) {
    throw new Error("Anthropic returned no content.");
  }
  return reply;
}
