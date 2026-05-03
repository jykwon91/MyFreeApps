/* global self, caches */
// Kill-switch service worker.
//
// vite-plugin-pwa was removed 2026-05-01 (see vite.config.ts comment for
// background). Browsers that visited the site before this change have a
// registered service worker that precaches a stale bundle. Browsers
// re-fetch sw.js on every page load, so we ship this minimal SW that:
//
//   1. Unregisters itself
//   2. Clears every cache it created
//   3. Reloads any open clients so they pick up the network-served bundle
//
// Once every existing browser has visited at least once after this deploys,
// no SWs remain registered and this file can be deleted in a follow-up.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});
