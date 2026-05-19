// `notekit upgrade` — shows the current plan and how to upgrade.
//
// The CLI cannot process payments itself — Apple IAP, Google Play IAP, and
// Stripe/Lemonsqueezy on web all happen client-side in their respective
// surfaces. This command exists so a terminal user can (a) check what plan
// they're on without opening the web app, and (b) get a clear pointer to
// where to upgrade.

import { defineCommand } from "citty";
import kleur from "kleur";
import open from "open";
import { getClient, dieWithError } from "../client.js";
import { loadConfig } from "../config.js";

function plusPitch(mobileFreeNotes: number): string[] {
  return [
    "NoteKit Plus unlocks:",
    `  · unlimited mobile notes (free tier caps at ${mobileFreeNotes})`,
    "  · agent collaboration in private vaults",
    "  · priority sync + push notifications",
    "",
    "Pricing: $1.49/mo or $14.99/yr (Apple/Google IAP, Stripe on web).",
    "Lifetime $49–79 — web only.",
  ];
}

export const upgradeCommand = defineCommand({
  meta: {
    name: "upgrade",
    description: "Show your current plan and where to upgrade to Plus.",
  },
  args: {
    open: {
      type: "boolean",
      description: "Open the web app's settings page in your default browser.",
      required: false,
    },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const ent = await nk.iap.entitlement();
      const cfg = await loadConfig();

      if (ent.plus) {
        const src = ent.plusSource ?? "unknown";
        const until = ent.plusUntil ? `until ${formatDate(ent.plusUntil)}` : "(no expiry on record)";
        process.stdout.write(
          `${kleur.green("Plus")}  ${kleur.dim(`via ${src} ${until}`)}\n`,
        );
        return;
      }

      process.stdout.write(`${kleur.yellow("Free")}  ${kleur.dim("mobile cap: " + ent.softLimits.mobileFreeNotes + " notes")}\n\n`);
      for (const line of plusPitch(ent.softLimits.mobileFreeNotes)) {
        process.stdout.write(line + "\n");
      }

      // The web app's pricing page lives on the web origin, which the CLI
      // doesn't track explicitly — we derive it from the API URL by
      // dropping the api. subdomain (best effort; users with custom
      // deployments can override with --open=false and visit manually).
      const webUrl = deriveWebUrl(cfg.apiUrl);
      process.stdout.write(`\nUpgrade: ${kleur.cyan(webUrl)}\n`);
      process.stdout.write(`Or open the NoteKit iOS / Android app and tap Settings → Upgrade.\n`);

      if (args.open) {
        await open(webUrl).catch(() => undefined);
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Best-effort guess at the matching web origin for a given API URL.
 *   http://localhost:3001     → http://localhost:5173 (dev)
 *   https://api.notekit.app   → https://notekit.app   (prod)
 *   https://notekit-api.x.com → https://notekit.x.com (subdomain prefix)
 * Falls back to the API URL itself if no pattern matches; users can always
 * visit their bookmarked instance.
 */
function deriveWebUrl(apiUrl: string): string {
  try {
    const u = new URL(apiUrl);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      u.port = "5173";
      return u.toString().replace(/\/$/, "");
    }
    if (u.hostname.startsWith("api.")) {
      u.hostname = u.hostname.slice("api.".length);
      return u.toString().replace(/\/$/, "");
    }
    const dashApi = u.hostname.match(/^([^.]+)-api\.(.+)$/);
    if (dashApi) {
      u.hostname = `${dashApi[1]}.${dashApi[2]}`;
      return u.toString().replace(/\/$/, "");
    }
  } catch {
    // fall through
  }
  return apiUrl;
}
