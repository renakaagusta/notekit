import { describe, it, expect } from "vitest";
import { deviceLabel } from "./device-key";

// Representative user-agent strings.
const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  edgeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  iosWebview:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadWebview:
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

describe("deviceLabel", () => {
  it("names a web browser by browser + OS", () => {
    expect(deviceLabel(UA.chromeMac, { native: "web", electron: false })).toBe(
      "Chrome browser in Mac",
    );
    expect(deviceLabel(UA.safariMac, { native: "web", electron: false })).toBe(
      "Safari browser in Mac",
    );
    expect(deviceLabel(UA.firefoxLinux, { native: "web", electron: false })).toBe(
      "Firefox browser in Linux",
    );
  });

  it("matches Edge before Chrome (Edge UA also contains 'Chrome')", () => {
    expect(deviceLabel(UA.edgeWin, { native: "web", electron: false })).toBe(
      "Edge browser in Windows",
    );
  });

  it("names the Electron desktop app by OS, like a native app", () => {
    expect(deviceLabel(UA.chromeMac, { native: "web", electron: true })).toBe(
      "Mac",
    );
  });

  it("names the Capacitor app by hardware, ignoring the WebView UA", () => {
    expect(deviceLabel(UA.iosWebview, { native: "ios", electron: false })).toBe(
      "iPhone",
    );
    expect(deviceLabel(UA.ipadWebview, { native: "ios", electron: false })).toBe(
      "iPad",
    );
    expect(
      deviceLabel("Mozilla/5.0 (Linux; Android 14)", {
        native: "android",
        electron: false,
      }),
    ).toBe("Android");
  });

  it("falls back to a bare browser label when the OS is unknown", () => {
    expect(
      deviceLabel("Mozilla/5.0 (Unknown) Chrome/124.0", {
        native: "web",
        electron: false,
      }),
    ).toBe("Chrome browser");
  });
});
