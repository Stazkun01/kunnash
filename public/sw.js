// Kunnash service worker: opens instantly and works offline once installed.
// Your data never goes through here; /api is always live.
const CACHE = "kunnash-v5";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/apple-touch-icon.png", "/icon-512.png", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  // Pages: try the network first so updates show up, fall back to the saved copy offline.
  if (req.mode === "navigate") {
    const page = url.pathname === "/" || url.pathname === "/index.html" ? "/" : url.pathname;
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(page, copy));
          }
          return r;
        })
        .catch(() => caches.match(page).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Icons and fonts: use the saved copy, fetch and save it the first time.
  const cacheable = url.origin === location.origin || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!cacheable) return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok || r.type === "opaque") {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return r;
        })
    )
  );
});
