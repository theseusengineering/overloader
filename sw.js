const CACHE_NAME = "overloader-v1.3.2";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=1.3.2",
  "./app.js?v=1.3.2",
  "./data.js",
  "./strong-history.js",
  "./logic.js",
  "./storage.js",
  "./sync.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const networkFirst = event.request.mode === "navigate"
    || event.request.destination === "script"
    || event.request.destination === "style"
    || url.pathname.endsWith(".html")
    || url.pathname.endsWith(".js")
    || url.pathname.endsWith(".css");
  event.respondWith(networkFirst ? fetchThenCache(event.request) : cacheThenFetch(event.request));
});

function fetchThenCache(request) {
  const url = new URL(request.url);
  const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname.startsWith("192.168.");
  const fetchReq = isLocal ? new Request(request.url, { cache: "no-store" }) : request;

  return fetch(fetchReq)
    .then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")));
}

function cacheThenFetch(request) {
  return caches.match(request)
    .then((cached) => cached || fetchThenCache(request));
}
