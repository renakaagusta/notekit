import { useEffect, useState } from "react";
import {
  listNotifications,
  markAllRead,
  markRead,
  type NotificationItem,
} from "../lib/notifications-api";
import { SkeletonCommitList } from "./Skeleton";

/**
 * Read-only inbox showing what agents have done. Newest first, paginated by
 * cursor. Unread rows render with a dot; clicking the row marks it read.
 */
export function NotificationsInbox() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications(50, cursor ?? undefined);
      setItems((prev) => [...prev, ...res.notifications]);
      setCursor(res.nextCursor);
      if (!res.nextCursor) setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMarkRead(id: string) {
    try {
      await markRead(id);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, readAt: new Date().toISOString() } : it,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((it) => ({ ...it, readAt: it.readAt ?? now })));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="notifications-inbox">
      <header>
        <h2>Notifications</h2>
        <button onClick={handleMarkAllRead}>Mark all read</button>
      </header>
      {error && <div className="error">{error}</div>}
      {items.length === 0 && loading && <SkeletonCommitList count={4} />}
      {items.length === 0 && !loading && !error && (
        <div className="muted empty-state">
          No notifications yet. When an agent edits your vault, you'll see it here.
        </div>
      )}
      <ul className="notifications-list">
        {items.map((n) => (
          <li
            key={n.id}
            className={`notification ${n.readAt ? "read" : "unread"}`}
            onClick={() => !n.readAt && handleMarkRead(n.id)}
          >
            <div className="notification__head">
              {!n.readAt && <span className="dot" aria-hidden="true" />}
              <span className="agent">{n.agentSlug}</span>
              <time>{new Date(n.createdAt).toLocaleString()}</time>
            </div>
            <div className="notification__body">{n.summary}</div>
          </li>
        ))}
      </ul>
      {!done && (
        <button
          className="load-more"
          disabled={loading}
          onClick={loadMore}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
