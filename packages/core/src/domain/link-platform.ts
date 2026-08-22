export type LinkPlatform =
  | "x"
  | "instagram"
  | "facebook"
  | "youtube"
  | "github"
  | "linkedin"
  | "reddit"
  | "tiktok"
  | "hackernews"
  | "producthunt"
  | "medium"
  | "substack";

const PLATFORM_MAP: [string, LinkPlatform][] = [
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["instagram.com", "instagram"],
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["github.com", "github"],
  ["linkedin.com", "linkedin"],
  ["reddit.com", "reddit"],
  ["tiktok.com", "tiktok"],
  ["news.ycombinator.com", "hackernews"],
  ["producthunt.com", "producthunt"],
  ["medium.com", "medium"],
  ["substack.com", "substack"],
];

export function detectPlatform(url: string): LinkPlatform | null {
  try {
    const { hostname } = new URL(url);
    for (const [domain, platform] of PLATFORM_MAP) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return platform;
      }
    }
  } catch {
    // invalid URL
  }
  return null;
}

export function platformLabel(platform: string | null): string {
  switch (platform) {
    case "x": return "X";
    case "instagram": return "Instagram";
    case "facebook": return "Facebook";
    case "youtube": return "YouTube";
    case "github": return "GitHub";
    case "linkedin": return "LinkedIn";
    case "reddit": return "Reddit";
    case "tiktok": return "TikTok";
    case "hackernews": return "HN";
    case "producthunt": return "PH";
    case "medium": return "Medium";
    case "substack": return "Substack";
    default: return "";
  }
}
