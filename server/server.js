'use strict';
// Backend Deploy : OAuth GitHub, proxy d'API (le token ne quitte jamais le serveur), secrets chiffrés,
// vérification DNS, webhook de notification d'échec. Sans dépendance, sauf libsodium-wrappers (secrets).
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), dns = require('node:dns').promises;
const E = process.env, ROOT = path.join(__dirname, '..');
const SECRET = E.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PAGES_IPS = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const sessions = new Map();

const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sign = (v, s = SECRET) => v + '.' + crypto.createHmac('sha256', s).update(v).digest('base64url');
const unsign = (c, s = SECRET) => { if (!c || !c.includes('.')) return null; const v = c.slice(0, c.lastIndexOf('.')); return safeEq(sign(v, s), c) ? v : null; };
const verifySig = (secret, raw, header = '') => safeEq('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'), header);
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter((x) => x[0]));
const notifyBody = (ev) => {
  const r = ev.workflow_run; if (ev.action !== 'completed' || !r || r.conclusion !== 'failure') return null;
  const text = `❌ Déploiement en échec : ${ev.repository.full_name} (${r.head_branch} ${r.head_sha.slice(0, 7)}) ${r.html_url}`;
  return { text, content: text };
};
async function checkDns(domain, user, r = dns) {
  const target = `${user}.github.io`.toLowerCase(), out = { domain, target, ok: false, records: [] };
  try { out.records = await r.resolveCname(domain); out.ok = out.records.some((x) => x.replace(/\.$/, '').toLowerCase() === target); return out; } catch { /* pas de CNAME */ }
  try { out.records = await r.resolve4(domain); out.ok = out.records.length > 0 && out.records.every((x) => PAGES_IPS.includes(x)); } catch { /* introuvable */ }
  return out;
}
const body = (req, max = 1e6) => new Promise((ok, ko) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > max) { ko(new Error('trop gros')); req.destroy(); } }); req.on('end', () => ok(d)); req.on('error', ko); });
const json = (res, code, o, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
const session = (req) => sessions.get(unsign(cookies(req).sid));
const secure = () => (E.BASE_URL || '').startsWith('https') ? '; Secure' : '';
const gh = (token, p, opt = {}) => fetch('https://api.github.com' + p, { ...opt, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });

async function sealSecret(token, repo, name, value) {
  const sodium = require('libsodium-wrappers'); await sodium.ready;
  const k = await (await gh(token, `/repos/${repo}/actions/secrets/public-key`)).json(), V = sodium.base64_variants.ORIGINAL;
  const enc = sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(k.key, V)), V);
  return gh(token, `/repos/${repo}/actions/secrets/${name}`, { method: 'PUT', body: JSON.stringify({ encrypted_value: enc, key_id: k.key_id }) });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), p = url.pathname, s = session(req);
    try {
      if (p === '/auth/login') {
        if (!E.GITHUB_CLIENT_ID) return json(res, 501, { error: 'OAuth non configuré' });
        const st = crypto.randomBytes(16).toString('hex');
        res.writeHead(302, { 'Set-Cookie': `st=${sign(st)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secure()}`, Location: `https://github.com/login/oauth/authorize?client_id=${E.GITHUB_CLIENT_ID}&scope=repo%20workflow&state=${st}` });
        return res.end();
      }
      if (p === '/auth/callback') {
        if (unsign(cookies(req).st) !== url.searchParams.get('state')) return json(res, 400, { error: 'state invalide' });
        const t = await (await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: E.GITHUB_CLIENT_ID, client_secret: E.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code') }) })).json();
        if (!t.access_token) return json(res, 400, { error: 'échange OAuth refusé' });
        const u = await (await gh(t.access_token, '/user')).json(), sid = crypto.randomBytes(24).toString('hex');
        sessions.set(sid, { token: t.access_token, login: u.login });
        res.writeHead(302, { 'Set-Cookie': `sid=${sign(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure()}`, Location: '/' });
        return res.end();
      }
      if (p === '/api/me') return s ? json(res, 200, { login: s.login, backend: true }) : json(res, 401, { backend: true, oauth: !!E.GITHUB_CLIENT_ID });
      // Routes d'écriture : en-tête personnalisé obligatoire (protection CSRF).
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'deploy' && p !== '/webhook/github') return json(res, 403, { error: 'en-tête manquant' });
      if (p === '/auth/logout') { sessions.delete(unsign(cookies(req).sid)); return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' }); }
      if (p === '/webhook/github' && req.method === 'POST') {
        const raw = await body(req);
        if (!E.WEBHOOK_SECRET || !verifySig(E.WEBHOOK_SECRET, raw, req.headers['x-hub-signature-256'])) return json(res, 401, { error: 'signature invalide' });
        const n = notifyBody(JSON.parse(raw));
        if (n && E.NOTIFY_WEBHOOK_URL) await fetch(E.NOTIFY_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) }).catch(() => {});
        return json(res, 200, { notified: !!n });
      }
      if (p.startsWith('/api/') && !s) return json(res, 401, { error: 'Non connecté' });
      if (p.startsWith('/api/gh/')) {
        const rest = p.slice(7) + url.search;
        if (!/^\/[\w\-./?=&%,:+@]*$/.test(rest) || rest.includes('..')) return json(res, 400, { error: 'chemin refusé' });
        const r = await gh(s.token, rest, { method: req.method, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await body(req) });
        res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json', 'x-ratelimit-remaining': r.headers.get('x-ratelimit-remaining') || '' });
        return res.end(r.status === 204 ? undefined : Buffer.from(await r.arrayBuffer()));
      }
      if (p === '/api/secrets' && req.method === 'POST') {
        const { repo, name, value } = JSON.parse(await body(req));
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !/^[A-Z_][A-Z0-9_]*$/.test(name || '') || typeof value !== 'string' || !value) return json(res, 422, { error: 'Nom en MAJUSCULES_ET_TIRETS_BAS et valeur requis.' });
        const r = await sealSecret(s.token, repo, name, value);
        return r.ok ? json(res, 200, { ok: true }) : json(res, r.status, { error: 'GitHub a refusé le secret (droits du token ?).' });
      }
      if (p === '/api/dns') {
        const d = (url.searchParams.get('domain') || '').toLowerCase(), u = url.searchParams.get('user') || '';
        if (!/^(?!-)[a-z0-9.-]+\.[a-z]{2,}$/.test(d) || !/^[\w-]+$/.test(u)) return json(res, 422, { error: 'domaine invalide' });
        return json(res, 200, await checkDns(d, u));
      }
      // Fichiers statiques de l'app (hors dossiers internes).
      const rel = decodeURIComponent(p === '/' ? '/index.html' : p), top = rel.split('/')[1] || '';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || ['server', 'test', 'node_modules'].includes(top) || top.startsWith('.') || /^package|^\.env/.test(top) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'introuvable' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { json(res, 500, { error: 'Erreur serveur' }); }
  });
}
module.exports = { createServer, sign, unsign, verifySig, notifyBody, checkDns };
if (require.main === module) createServer().listen(E.PORT || 3000, () => console.log('Deploy sur http://localhost:' + (E.PORT || 3000)));
