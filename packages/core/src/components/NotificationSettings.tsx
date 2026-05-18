import { useEffect, useState } from "react";
import {
  createTelegramLinkCode,
  getNotificationStatus,
  unlinkTelegram,
  updatePrefs,
  type NotificationStatus,
} from "../lib/notifications-api";
import {
  isWebPushSubscribed,
  subscribeWebPush,
  unsubscribeWebPush,
} from "../lib/webPush";
import { isNativePlatform } from "../lib/native";
import { subscribeMobilePush } from "../lib/mobilePush";
import { SkeletonLines } from "./Skeleton";

/**
 * Three independent channels: Telegram, Web Push (browser), Mobile Push (Capacitor).
 * Each shows its own enabled/configured state. Mobile-only row hides on web.
 */
export function NotificationSettings() {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [webSubbed, setWebSubbed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkLink, setLinkLink] = useState<string | null>(null);
  const isMobile = isNativePlatform();

  async function refresh() {
    try {
      const [s, sub] = await Promise.all([
        getNotificationStatus(),
        isWebPushSubscribed(),
      ]);
      setStatus(s);
      setWebSubbed(sub);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleLinkTelegram() {
    setBusy("telegram");
    setError(null);
    try {
      const { url } = await createTelegramLinkCode();
      setLinkLink(url);
      // Mobile webview can't open t.me reliably with window.open; show the
      // link and let the user copy it. Desktop opens directly.
      if (!isMobile) window.open(url, "_blank", "noopener");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleUnlinkTelegram() {
    setBusy("telegram");
    try {
      await unlinkTelegram();
      setLinkLink(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleTelegramSend(next: boolean) {
    setBusy("telegram");
    try {
      await updatePrefs({ telegramEnabled: next });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableWebPush() {
    setBusy("web");
    setError(null);
    try {
      await subscribeWebPush();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDisableWebPush() {
    setBusy("web");
    try {
      await unsubscribeWebPush();
      await updatePrefs({ webPushEnabled: false });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableMobilePush() {
    setBusy("mobile");
    setError(null);
    try {
      await subscribeMobilePush();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDisableMobilePush() {
    setBusy("mobile");
    try {
      await updatePrefs({ mobilePushEnabled: false });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!status) return <SkeletonLines count={4} />;

  return (
    <div className="notification-settings">
      <header>
        <h2>Notifications</h2>
        <p className="muted">
          Get a ping when an agent updates your vault. Channels are independent
          — link as many as you want.
        </p>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="channel-row">
        <div className="channel-row__head">
          <strong>Telegram</strong>
          <span className="badge">
            {status.channels.telegram.linked ? "Linked" : "Not linked"}
          </span>
        </div>
        {status.channels.telegram.linked ? (
          <div className="channel-row__body">
            <label className="toggle">
              <input
                type="checkbox"
                checked={status.prefs.telegramEnabled}
                disabled={busy === "telegram"}
                onChange={(e) => handleToggleTelegramSend(e.target.checked)}
              />
              <span>Send agent updates to Telegram</span>
            </label>
            <button
              onClick={handleUnlinkTelegram}
              disabled={busy === "telegram"}
            >
              Unlink
            </button>
          </div>
        ) : (
          <div className="channel-row__body">
            <button
              onClick={handleLinkTelegram}
              disabled={busy === "telegram"}
            >
              Link Telegram
            </button>
            {linkLink && (
              <a href={linkLink} target="_blank" rel="noopener" className="link">
                Open in Telegram →
              </a>
            )}
          </div>
        )}
      </section>

      <section className="channel-row">
        <div className="channel-row__head">
          <strong>Browser notifications</strong>
          <span className="badge">
            {webSubbed ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="channel-row__body">
          {webSubbed ? (
            <button
              onClick={handleDisableWebPush}
              disabled={busy === "web"}
            >
              Disable
            </button>
          ) : (
            <button
              onClick={handleEnableWebPush}
              disabled={busy === "web" || !status.channels.webPush.configured}
            >
              Enable
            </button>
          )}
          {!status.channels.webPush.configured && (
            <span className="muted">
              Server isn't configured for web push (missing VAPID keys).
            </span>
          )}
        </div>
      </section>

      {isMobile && (
        <section className="channel-row">
          <div className="channel-row__head">
            <strong>Mobile push</strong>
            <span className="badge">
              {status.prefs.mobilePushEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="channel-row__body">
            {status.prefs.mobilePushEnabled ? (
              <button
                onClick={handleDisableMobilePush}
                disabled={busy === "mobile"}
              >
                Disable
              </button>
            ) : (
              <button
                onClick={handleEnableMobilePush}
                disabled={busy === "mobile"}
              >
                Enable
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
