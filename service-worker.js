const CACHE_PREFIX = "fragmentmove-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const SCOPE_URL = new URL(self.registration.scope);
const scopedUrl = (path = "") => new URL(path, SCOPE_URL).toString();
const INDEX_URL = scopedUrl("index.html");
const SEED_URL = scopedUrl("data/seed_videos.json");
const L10_2B_SEED_URL = scopedUrl("data/seed_videos_l10_2b.json");
const ASSET_MANIFEST_URL = scopedUrl("asset-manifest.json");

const CORE_SHELL = [
  scopedUrl(""),
  INDEX_URL,
  scopedUrl("manifest.webmanifest"),
  scopedUrl("icons/fragmentmove-icon.svg"),
  scopedUrl("icons/fragmentmove-icon-180.png"),
  scopedUrl("icons/fragmentmove-icon-192.png"),
  SEED_URL,
  L10_2B_SEED_URL,
  ASSET_MANIFEST_URL,
];

async function buildAssetUrls() {
  try {
    const response = await fetch(ASSET_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json();
    const paths = [];

    Object.values(manifest).forEach((entry) => {
      if (entry && typeof entry.file === "string") paths.push(entry.file);
      if (entry && Array.isArray(entry.css)) paths.push(...entry.css);
      if (entry && Array.isArray(entry.assets)) paths.push(...entry.assets);
    });

    return [...new Set(paths)].map((path) => scopedUrl(path));
  } catch {
    return [];
  }
}

async function cacheInstallShell() {
  const cache = await caches.open(CACHE_NAME);
  const buildAssets = await buildAssetUrls();
  await cache.addAll([...new Set([...CORE_SHELL, ...buildAssets])]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheInstallShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(fallbackUrl || request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(fallbackUrl || request, { ignoreSearch: true });
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== SCOPE_URL.origin ||
    !url.pathname.startsWith(SCOPE_URL.pathname)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, INDEX_URL));
    return;
  }

  if (url.toString() === SEED_URL || url.toString() === L10_2B_SEED_URL) {
    event.respondWith(networkFirst(request, url.toString()));
    return;
  }

  event.respondWith(cacheFirst(request));
});
