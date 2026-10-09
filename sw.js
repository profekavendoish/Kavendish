// Service worker: guarda la interfaz en el teléfono para que la página abra aunque no haya señal.
// Estrategia: primero intenta la red (para que las actualizaciones lleguen enseguida);
// si la red falla o tarda más de 3 s, usa la copia guardada.
const CACHE = "kavendish-v1"; // súbele el número cuando quieras forzar que todos descarguen de nuevo
const ARCHIVOS = [
  "./",
  "index.html",
  "style.css",
  "geo.js",
  "app.js",
  "config.js",
  "vendor/supabase.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // lo de otros sitios (Supabase) no se toca
  e.respondWith(redPrimero(req));
});

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await Promise.race([
      fetch(req),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("red lenta")), 3000)),
    ]);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    const guardado =
      (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === "navigate" ? await cache.match("index.html") : undefined);
    return guardado || Response.error();
  }
}
