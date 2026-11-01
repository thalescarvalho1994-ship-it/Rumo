/* RUMO fora do Claude: implementa a mesma interface window.claude (db, user, downloads)
   usando o Supabase (Auth + tabela rumo_docs) e os arquivos de conteúdo do próprio site. */
(function () {
  const SB_URL = 'https://orkfvddqakmuljsxecxd.supabase.co';
  const SB_KEY = 'sb_publishable_M0OrutMdeoay8feSePOaNA_FKkf4yvi';
  const LS = 'rumo.sessao';
  const STATIC = {
    content: { plano: 'content/plano.json' },
    content_q: { AN: 'content/q_AN.json', COM: 'content/q_COM.json', LEG: 'content/q_LEG.json', MAN: 'content/q_MAN.json', NAR: 'content/q_NAR.json' },
    content_fc: { AN: 'content/fc_AN.json', COM: 'content/fc_COM.json', ING: 'content/fc_ING.json', LEG: 'content/fc_LEG.json', MAN: 'content/fc_MAN.json', NAR: 'content/fc_NAR.json' },
  };
  const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const err = (code, message) => Object.assign(new Error(message || code), { code });

  /* ---------- sessão (Supabase Auth via REST) ---------- */
  let sess = null;
  try { sess = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { sess = null; }
  const salvaSessao = s => { sess = s; try { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); } catch (e) {} };
  async function auth(path, body) {
    const r = await fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err('auth', j.msg || j.error_description || j.message || ('Erro ' + r.status));
    return j;
  }
  const guarda = j => { if (j && j.access_token) salvaSessao({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: j.user }); return j; };
  let refreshing = null;
  async function token() {
    if (!sess) throw err('unauthenticated');
    if (Date.now() < sess.expires_at - 60000) return sess.access_token;
    if (!refreshing) refreshing = auth('token?grant_type=refresh_token', { refresh_token: sess.refresh_token }).then(guarda).finally(() => { refreshing = null; });
    try { await refreshing; } catch (e) { if (navigator.onLine) { salvaSessao(null); location.reload(); } throw err('unavailable'); }
    return sess.access_token;
  }
  async function rest(method, query, body, prefer) {
    const t = await token();
    const h = { apikey: SB_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
    if (prefer) h.Prefer = prefer;
    let r;
    try { r = await fetch(SB_URL + '/rest/v1/rumo_docs' + query, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw err('unavailable'); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw err(r.status === 401 ? 'unauthenticated' : 'unavailable', j.message); }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  /* ---------- espelho local + sincronização ---------- */
  const remoto = {};      // path -> data (do Supabase)
  const fixo = {};        // path -> data (arquivos do site)
  const subs = new Set();
  const notify = () => subs.forEach(f => { try { f(); } catch (e) {} });
  let carregado = null;
  async function carregaFixo() {
    const jobs = [];
    for (const [col, docs] of Object.entries(STATIC)) for (const [id, url] of Object.entries(docs))
      jobs.push(fetch(url, { cache: 'no-cache' }).then(r => r.json()).then(j => { fixo[col + '/' + id] = j; }).catch(() => {}));
    await Promise.all(jobs);
  }
  async function puxa() {
    const rows = await rest('GET', '?select=path,data');
    for (const k of Object.keys(remoto)) delete remoto[k];
    (rows || []).forEach(r => { remoto[r.path] = r.data; });
    try { localStorage.setItem('rumo.espelho', JSON.stringify(remoto)); } catch (e) {}
  }
  function carrega() {
    if (!carregado) carregado = (async () => {
      try { Object.assign(remoto, JSON.parse(localStorage.getItem('rumo.espelho') || '{}')); } catch (e) {}
      await carregaFixo();
      try { await puxa(); } catch (e) { /* offline: fica com o espelho local */ }
    })();
    return carregado;
  }
  let ultimo = 0;
  async function sync() { if (Date.now() - ultimo < 4000) return; ultimo = Date.now(); try { await puxa(); notify(); } catch (e) {} }
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', sync);

  const valor = path => (path in remoto ? remoto[path] : fixo[path]);
  const snap = path => ({ id: path.split('/').pop(), exists: valor(path) !== undefined, data: () => clone(valor(path)), metadata: { fromCache: false, hasPendingWrites: false } });
  function merge(a, b) {
    for (const k in b) {
      const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (v.__delete__ === true) { delete a[k]; continue; }
        a[k] = merge(a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? a[k] : {}, v);
      } else a[k] = v;
    }
    return a;
  }
  const strip = o => { if (!o || typeof o !== 'object' || Array.isArray(o)) return o; const r = {}; for (const k in o) { const v = o[k]; if (v && typeof v === 'object' && v.__delete__) continue; r[k] = strip(v); } return r; };
  async function grava(path, data) {
    remoto[path] = data; notify();
    await rest('POST', '?on_conflict=owner,path', { path, data, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
  }
  const doc = path => ({
    path,
    get: async () => { await carrega(); return snap(path); },
    set: async d => { await carrega(); await grava(path, strip(clone(d))); },
    update: async patch => {
      await carrega();
      const atual = valor(path);
      if (atual === undefined) throw err('invalid_argument', 'documento não existe');
      await grava(path, merge(clone(atual), clone(patch)));
    },
    delete: async () => { delete remoto[path]; notify(); await rest('DELETE', '?path=eq.' + encodeURIComponent(path), null, 'return=minimal'); },
    onSnapshot(next) { const f = () => next(snap(path)); subs.add(f); carrega().then(f); return () => subs.delete(f); },
  });
  const collection = col => ({
    path: col,
    doc: id => doc(col + '/' + id),
    onSnapshot(next) {
      const n = col.split('/').length + 1;
      const f = () => {
        const paths = new Set([...Object.keys(fixo), ...Object.keys(remoto)].filter(p => p.startsWith(col + '/') && p.split('/').length === n));
        const docs = [...paths].filter(p => valor(p) !== undefined).map(snap);
        next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} });
      };
      subs.add(f); carrega().then(f); return () => subs.delete(f);
    },
  });

  /* ---------- downloads ---------- */
  const downloads = {
    async save({ filename, data, mimeType }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/json' });
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') throw err('declined'); }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
  };

  /* ---------- tela de entrada ---------- */
  function telaLogin() {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.id = 'rumoLogin';
      el.innerHTML = `<style>
        #rumoLogin{position:fixed;inset:0;z-index:9999;background:radial-gradient(120% 80% at 50% 0%,#0B2447 0%,#050E1F 60%);color:#E8F2FF;display:flex;align-items:center;justify-content:center;padding:24px 16px;font-family:Inter,system-ui,sans-serif}
        #rumoLogin .box{width:100%;max-width:380px;display:flex;flex-direction:column;gap:12px}
        #rumoLogin img{width:220px;max-width:70%;align-self:center;margin-bottom:8px}
        #rumoLogin label{font-size:13px;color:#9FB3CF;display:flex;flex-direction:column;gap:6px}
        #rumoLogin input{font:inherit;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid #23406A;background:#0A1A33;color:#E8F2FF}
        #rumoLogin button{font:inherit;font-weight:700;font-size:16px;padding:13px;border-radius:12px;border:0;cursor:pointer}
        #rumoLogin .pri{background:#00C2FF;color:#03101F}
        #rumoLogin .sec{background:transparent;color:#00C2FF;border:1px solid #23406A}
        #rumoLogin .msg{font-size:13.5px;min-height:20px;color:#FFD166;line-height:1.4}
      </style>
      <form class="box" autocomplete="on">
        <img src="icons/logo.png" alt="RUMO">
        <label>E-mail<input id="lgEmail" type="email" autocomplete="username" required></label>
        <label>Senha<input id="lgSenha" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="pri" type="submit">Entrar</button>
        <button class="sec" type="button" id="lgCriar">Criar conta (primeira vez)</button>
        <div class="msg" id="lgMsg"></div>
      </form>`;
      document.body.appendChild(el);
      const msg = t => { el.querySelector('#lgMsg').textContent = t; };
      const vals = () => [el.querySelector('#lgEmail').value.trim(), el.querySelector('#lgSenha').value];
      const ok = () => { el.remove(); resolve(); };
      el.querySelector('form').onsubmit = async e => {
        e.preventDefault(); const [email, password] = vals(); msg('Entrando…');
        try { guarda(await auth('token?grant_type=password', { email, password })); ok(); }
        catch (x) { msg(/invalid/i.test(x.message) ? 'E-mail ou senha incorretos.' : /confirm/i.test(x.message) ? 'Confirme o e-mail pelo link que o Supabase enviou e tente de novo.' : x.message); }
      };
      el.querySelector('#lgCriar').onclick = async () => {
        const [email, password] = vals();
        if (!email || password.length < 6) { msg('Preencha e-mail e uma senha com pelo menos 6 caracteres.'); return; }
        msg('Criando conta…');
        try {
          const j = await auth('signup', { email, password });
          if (j.access_token) { guarda(j); ok(); } else msg('Conta criada. Abra o e-mail de confirmação do Supabase, toque no link e depois toque em Entrar.');
        } catch (x) { msg(x.message); }
      };
    });
  }

  let pronto = null;
  const garanteLogin = () => (pronto = pronto || (async () => {
    if (!sess) await telaLogin();
    await carrega();
  })());

  window.rumoSair = () => { salvaSessao(null); try { localStorage.removeItem('rumo.espelho'); } catch (e) {} location.reload(); };
  window.claude = {
    async use(name) {
      if (name === 'db') { await garanteLogin(); return { doc, collection }; }
      if (name === 'user') { await garanteLogin(); return { id: async () => sess.user.id, canEdit: async () => true, isOwner: async () => true }; }
      if (name === 'downloads') return downloads;
      return null; // 'sample' (geração pelo Claude) não existe fora do Claude
    },
  };

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
