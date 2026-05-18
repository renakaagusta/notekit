/**
 * NoteKit service worker. Two jobs:
 *   1. Receive Web Push events and surface them as OS notifications.
 *   2. Focus an existing tab (or open one) when the user clicks the banner.
 *
 * Kept tiny on purpose. No caching strategy here yet — the web app does its
 * own offline-first sync.
 */
/* global self, clients */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "NoteKit", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "NoteKit";
  const options = {
    body: data.body || "",
    tag: data.notificationId || undefined,
    data: { notificationId: data.notificationId, payload: data.data },
    badge: "/icon-badge.png",
    icon: "/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })(),
  );
});
