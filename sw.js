/* RUMO: guarda o app para abrir sem internet. Dados do Supabase não passam por aqui. */
const V = 'rumo-v28';
const BASE = ['./', 'index.html', 'shim.js', 'manifest.webmanifest', 'icons/logo.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'content/plano.json', 'content/q_AN.json', 'content/q_COM.json', 'content/q_LEG.json', 'content/q_MAN.json', 'content/q_NAR.json',
  'content/fc_AN.json', 'content/fc_COM.json', 'content/fc_ING.json', 'content/fc_LEG.json', 'content/fc_MAN.json', 'content/fc_NAR.json'];
const EXT = ['https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(BASE).then(() => Promise.all(EXT.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {}))))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co')) return;
  // rede primeiro (pega atualizações), cópia guardada se estiver sem internet
  e.respondWith(fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
