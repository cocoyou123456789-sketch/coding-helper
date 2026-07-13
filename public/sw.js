/* global self, caches, fetch, URL, Response */

const CACHE_NAME = "algoquest-pwa-2026-07-13-lazy-v2";
const RUNTIME_CACHE = "algoquest-runtime-2026-07-13-lazy-v2";
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const ROOT_URL = `${SCOPE_PATH}/`;
const MAX_APP_ASSETS = 200;

function appUrl(path = "") {
  return `${ROOT_URL}${path}`;
}

async function putIfCacheable(cache, request, response) {
  if (response && (response.ok || response.type === "opaque")) {
    try {
      await cache.put(request, response.clone());
    } catch {
      // Some streamed or partial responses cannot be cached; the network response is still usable.
    }
  }
  return response;
}

function appAssetDependencies(source, baseUrl) {
  const dependencies = [];
  const pattern = /["'`]([^"'`]+\.(?:js|css))(?:\?[^"'`]*)?["'`]/g;
  for (const match of source.matchAll(pattern)) {
    try {
      const value = match[1];
      const url = value.startsWith("assets/")
        ? new URL(appUrl(value), self.location.origin)
        : new URL(value, baseUrl);
      if (url.origin === self.location.origin && url.pathname.startsWith(`${ROOT_URL}assets/`)) {
        dependencies.push(url.href);
      }
    } catch {
      // A string that merely looks like a filename is not necessarily a URL.
    }
  }
  return dependencies;
}

async function cacheAppAssetGraph(cache, initialUrls) {
  const pending = [...new Set(initialUrls)];
  const visited = new Set();

  while (pending.length && visited.size < MAX_APP_ASSETS) {
    const url = pending.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) continue;
      const source = new URL(url).pathname.endsWith(".js")
        ? await response.clone().text()
        : "";
      await putIfCacheable(cache, url, response);
      for (const dependency of appAssetDependencies(source, url)) {
        if (!visited.has(dependency)) pending.push(dependency);
      }
    } catch {
      // Runtime caching can fill an individual asset after a weak first install.
    }
  }
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const fixedAssets = [
    ROOT_URL,
    appUrl("manifest.webmanifest"),
    appUrl("favicon.png"),
    appUrl("icons/apple-touch-icon.png"),
    appUrl("icons/icon-192.png"),
    appUrl("icons/icon-512.png"),
    appUrl("icons/icon-maskable-512.png"),
    appUrl("python-worker.js"),
  ];

  await Promise.allSettled(fixedAssets.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    await putIfCacheable(cache, url, response);
  }));

  try {
    const pageResponse = await fetch(ROOT_URL, { cache: "reload" });
    if (!pageResponse.ok) return;
    await cache.put(ROOT_URL, pageResponse.clone());
    const html = await pageResponse.text();
    const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g), (match) => match[1])
      .map((value) => new URL(value, self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith(ROOT_URL))
      .map((url) => url.href);
    await cacheAppAssetGraph(cache, assetUrls);
  } catch {
    // A first install may happen on a weak connection; runtime caching will fill any missing assets later.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const currentCaches = new Set([CACHE_NAME, RUNTIME_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("algoquest-") && !currentCaches.has(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (!response.ok) {
      return (await cache.match(request, { ignoreSearch: true }))
        || (await cache.match(ROOT_URL))
        || response;
    }
    await putIfCacheable(cache, ROOT_URL, response);
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await cache.match(ROOT_URL))
      || new Response("AlgoQuest is offline. Reconnect once to finish installing the app.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
  }
}

async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  await putIfCacheable(cache, request, response);
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith(ROOT_URL)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("/pyodide/")) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});
