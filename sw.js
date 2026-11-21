// Garde une copie des fichiers de l'application dans le téléphone.
// En ligne, chaque fichier est redemandé au site (les mises à jour arrivent tout de suite) ;
// sans réseau, la copie gardée sert. Les cartes, communes et itinéraires ne passent pas par ici.
// Changer VERSION à chaque mise à jour pour renouveler la copie.
const VERSION = '2026-11-21-b';
const CACHE = `depannage-${VERSION}`;
const FICHIERS = [
  './',
  'index.html',
  'gestion.html',
  'commun.js',
  'stockage.js',
  'regulation.js',
  'gestion.js',
  'commun.css',
  'regulation.css',
  'gestion.css',
  'manifest.webmanifest',
  'icone.svg',
  'icone-180.png',
  'icone-192.png',
  'icone-512.png',
  'donnees/geo-34.json',
  'polices/polices.css',
  'polices/barlow-latin-400-normal.woff2',
  'polices/barlow-latin-500-normal.woff2',
  'polices/barlow-latin-600-normal.woff2',
  'polices/barlow-semi-condensed-latin-600-normal.woff2',
  'polices/barlow-semi-condensed-latin-700-normal.woff2',
  'lib/leaflet.js',
  'lib/leaflet.css',
  'lib/maplibre-gl.js',
  'lib/maplibre-gl.css',
  'lib/leaflet-maplibre-gl.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(c => c.startsWith('depannage-') && c !== CACHE).map(c => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const rep = await fetch(req, { cache: 'no-cache' });
      if (rep.ok) cache.put(req, rep.clone());
      return rep;
    } catch (err) {
      const garde = await cache.match(req, { ignoreSearch: true });
      if (garde) return garde;
      throw err;
    }
  })());
});
