const CACHE = 'linhagem-v14';
const ARQ = ['./', 'index.html', 'regras.js', 'logo.svg', 'manifest.json', 'icon-192.png', 'icon-512.png', 'xlsx.min.js'];
// arquivos que não mudam entre versões (o nome do cache muda a cada publicação): sempre do cache, sem esperar a rede
const FIXOS = ['xlsx.min.js', 'logo.svg', 'icon-192.png', 'icon-512.png', 'manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQ)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.includes('script.google')) return; // servidor: sempre rede
  const doCache = () => caches.match(e.request, { ignoreSearch: true });
  const daRede = () => fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; });
  if (FIXOS.some(f => u.pathname.endsWith('/' + f))) { e.respondWith(doCache().then(r => r || daRede())); return; }
  // página e regras: tenta a rede (pega atualizações), mas com sinal fraco não espera mais de 3 s — abre do cache e atualiza por trás
  e.respondWith(new Promise(ok => {
    let feito = false;
    const rede = daRede();
    const t = setTimeout(() => doCache().then(r => { if (r && !feito) { feito = true; ok(r); } }), 3000);
    rede.then(r => { if (!feito) { feito = true; clearTimeout(t); ok(r); } })
      .catch(() => doCache().then(r => { if (!feito) { feito = true; clearTimeout(t); ok(r || Response.error()); } }));
  }));
});
