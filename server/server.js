'use strict';
// Backend Deploy : OAuth GitHub, proxy d'API (le token ne quitte jamais le serveur), secrets chiffrés,
// vérification DNS, webhook de notification d'échec. Sans dépendance, sauf libsodium-wrappers (secrets).
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), dns = require('node:dns').promises;
const E = process.env, ROOT = path.join(__dirname, '..');
const SECRET = E.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PAGES_IPS = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUBLIC = new Set(['index.html', 'landing.html', 'css', 'js']); // seuls éléments servis à la racine
const sessions = new Map(), SESSION_TTL = 8 * 3600e3;
if (!E.SESSION_SECRET) console.warn('SESSION_SECRET absent : les sessions seront perdues à chaque redémarrage (voir .env.example).');

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
const session = (req) => { const id = unsign(cookies(req).sid), s = id && sessions.get(id); if (s && s.exp < Date.now()) { sessions.delete(id); return undefined; } return s || undefined; };
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
        sessions.set(sid, { token: t.access_token, login: u.login, exp: Date.now() + SESSION_TTL });
        res.writeHead(302, { 'Set-Cookie': `sid=${sign(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure()}`, Location: '/' });
        return res.end();
      }
      if (p === '/healthz') return json(res, 200, { ok: true });
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

      // Stalwart: les secrets sont exclusivement côté serveur. Les routes exigent la session Deploy.
      const mailConfigured = !!(E.STALWART_URL && E.STALWART_ADMIN_TOKEN && E.STALWART_JMAP_TOKEN);
      const mailBase = (E.STALWART_URL || '').replace(/\/$/, '');
      const mailAdmin = async (method, endpoint, data) => {
        if (!mailConfigured) throw Object.assign(new Error('Stalwart non configuré. Renseignez STALWART_URL, STALWART_ADMIN_TOKEN et STALWART_JMAP_TOKEN.'), { status: 503 });
        const r = await fetch(mailBase + endpoint, { method, headers: { Authorization: 'Bearer ' + E.STALWART_ADMIN_TOKEN, Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
        const raw = await r.text(); let dataOut; try { dataOut = raw ? JSON.parse(raw) : {}; } catch { dataOut = { message: raw.slice(0, 300) }; }
        if (!r.ok) throw Object.assign(new Error(dataOut.message || dataOut.error || 'Stalwart a refusé la requête (' + r.status + ').'), { status: r.status });
        return dataOut;
      };
      const jmap = async (methods) => {
        const token = methods.some(([method]) => method.startsWith('x:')) ? E.STALWART_ADMIN_TOKEN : E.STALWART_JMAP_TOKEN;
        if (!mailConfigured) throw Object.assign(new Error('Stalwart non configuré.'), { status: 503 });
        const sr = await fetch(mailBase + '/jmap/session', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
        if (!sr.ok) throw Object.assign(new Error('Impossible d’ouvrir la session JMAP (' + sr.status + ').'), { status: sr.status });
        const sess = await sr.json(), accountId = E.STALWART_JMAP_ACCOUNT_ID || Object.keys(sess.accounts || {})[0];
        if (!sess.apiUrl) throw Object.assign(new Error('La session Stalwart ne fournit aucune URL JMAP utilisable.'), { status: 502 });
        const normalizedMethods = methods.map(([method, args, callId]) => [method, { ...args, ...(args.accountId === 'default' ? { accountId } : {}) }, callId]);
        const jr = await fetch(sess.apiUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission', 'urn:stalwart:jmap'], methodCalls: normalizedMethods, createdIds: {} }) });
        const result = await jr.json().catch(() => ({}));
        if (!jr.ok) throw Object.assign(new Error('Requête JMAP refusée (' + jr.status + ').'), { status: jr.status });
        return { result, accountId };
      };
      const mailJsonBody = async () => { try { return JSON.parse(await body(req, 256 * 1024)); } catch { throw Object.assign(new Error('Corps JSON invalide ou trop volumineux.'), { status: 400 }); } };
      if (p.startsWith('/api/mail/')) {
        if (!mailConfigured && p !== '/api/mail/status') return json(res, 503, { error: 'Service Stalwart non configuré.' });
        if (p === '/api/mail/status' && req.method === 'GET') return json(res, 200, { configured: mailConfigured, url: E.STALWART_URL ? new URL(E.STALWART_URL).origin : null });
        if (p === '/api/mail/messages' && req.method === 'GET') {
          const folder = url.searchParams.get('folder') === 'sent' ? 'sent' : 'inbox';
          const { result, accountId } = await jmap([
            ['Mailbox/get', { accountId: E.STALWART_JMAP_ACCOUNT_ID || 'default', ids: null }, 'mb'],
          ]);
          // A second JMAP call uses the actual account ID resolved from the session.
          if (!accountId) return json(res, 502, { error: 'Aucun compte JMAP associé au jeton. Configurez STALWART_JMAP_ACCOUNT_ID.' });
          const mailboxes = result.methodResponses?.[0]?.[1]?.list || [];
          const box = mailboxes.find(m => m.role === (folder === 'sent' ? 'sent' : 'inbox'));
          if (!box) return json(res, 200, { messages: [] });
          const q = await jmap([['Email/query', { accountId, filter: { inMailbox: box.id }, sort: [{ property: 'receivedAt', isAscending: false }], limit: 50 }, 'q']]);
          const ids = q.result.methodResponses?.find(x => x[0] === 'Email/query')?.[1]?.ids || [];
          if (!ids.length) return json(res, 200, { messages: [] });
          const got = await jmap([['Email/get', { accountId, ids, properties: ['id','from','to','subject','preview','receivedAt','bodyValues','bodyStructure','mailboxIds'], fetchTextBodyValues: true }, 'e']]);
          const messages = got.result.methodResponses?.find(x => x[0] === 'Email/get')?.[1]?.list || [];
          return json(res, 200, { messages });
        }
        if (p === '/api/mail/send' && req.method === 'POST') {
          const data = await mailJsonBody(), to = String(data.to || '').trim(), subject = String(data.subject || '').trim(), textBody = String(data.text || ''), from = String(E.STALWART_FROM_ADDRESS || '').trim();
          if (!/^[^ @]+@[^ @]+[.][^ @]+$/.test(to) || !subject || !textBody.trim()) return json(res, 422, { error: 'Destinataire, objet et message sont obligatoires.' });
          if (!from || !/^[^ @]+@[^ @]+[.][^ @]+$/.test(from)) return json(res, 503, { error: 'Configurez STALWART_FROM_ADDRESS avec une adresse d’expédition autorisée.' });
          if (to.length > 254 || subject.length > 998 || textBody.length > 100000) return json(res, 413, { error: 'Message trop volumineux.' });
          const sr = await fetch(mailBase + '/jmap/session', { headers: { Authorization: 'Bearer ' + E.STALWART_JMAP_TOKEN, Accept: 'application/json' } });
          if (!sr.ok) return json(res, 502, { error: 'Impossible d’ouvrir la session JMAP (' + sr.status + ').' });
          const sess = await sr.json(), accountId = E.STALWART_JMAP_ACCOUNT_ID || Object.keys(sess.accounts || {})[0];
          if (!accountId || !sess.uploadUrl || !sess.apiUrl) return json(res, 502, { error: 'La session JMAP ne fournit pas les URL requises.' });
          const encSubject = [...subject].some(ch => ch.charCodeAt(0) > 126) ? '=?UTF-8?B?' + Buffer.from(subject).toString('base64') + '?=' : subject.replace(/[\r\n]/g, ' ');
          const safeBody = textBody.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
          const rawMail = 'From: ' + from + '\r\nTo: ' + to + '\r\nSubject: ' + encSubject + '\r\nDate: ' + new Date().toUTCString() + '\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n' + safeBody + '\r\n';
          const uploadUrl = sess.uploadUrl.replace('{accountId}', encodeURIComponent(accountId));
          const uploaded = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + E.STALWART_JMAP_TOKEN, 'Content-Type': 'message/rfc822' }, body: rawMail });
          const blob = await uploaded.json().catch(() => ({}));
          if (!uploaded.ok || !blob.blobId) return json(res, 502, { error: 'Stalwart a refusé le téléversement du message (' + uploaded.status + ').' });
          const boxes = await jmap([['Mailbox/get', { accountId, ids: null }, 'mb']]);
          const mailboxList = boxes.result.methodResponses?.find(x => x[0] === 'Mailbox/get')?.[1]?.list || [];
          const drafts = mailboxList.find(m => m.role === 'drafts');
          const sentBox = mailboxList.find(m => m.role === 'sent');
          if (!drafts || !sentBox) return json(res, 502, { error: 'Les dossiers Brouillons et Envoyés doivent exister dans ce compte JMAP.' });
          const imported = await jmap([['Email/import', { accountId, emails: { newEmail: { blobId: blob.blobId, mailboxIds: { [drafts.id]: true }, keywords: { '$draft': true } } } }, 'import']]);
          const importedPayload = imported.result.methodResponses?.find(x => x[0] === 'Email/import')?.[1];
          const emailId = importedPayload?.created?.newEmail?.id;
          if (!emailId) return json(res, 502, { error: 'Stalwart n’a pas importé le message : vérifiez les permissions JMAP.' });
          const submitted = await jmap([['EmailSubmission/set', { accountId, create: { submission: { emailId, envelope: { mailFrom: { email: from }, rcptTo: [{ email: to }] } } }, onSuccessUpdateEmail: { [emailId]: { mailboxIds: { [drafts.id]: null, [sentBox.id]: true }, keywords: { '$draft': null, '$seen': true } } } }, 'submit']]);
          const submitSet = submitted.result.methodResponses?.find(x => x[0] === 'EmailSubmission/set')?.[1];
          if (submitSet?.notCreated?.submission) return json(res, 502, { error: 'Stalwart n’a pas pu soumettre le message.' });
          return json(res, 201, { sent: true });
        }
        if (p === '/api/mail/mailboxes' && req.method === 'GET') {
          const q = await jmap([['x:Account/query', { filter: {} }, 'q']]);
          const ids = q.result.methodResponses?.find(x => x[0] === 'x:Account/query')?.[1]?.ids || [];
          if (!ids.length) return json(res, 200, { mailboxes: [] });
          const got = await jmap([['x:Account/get', { ids }, 'g']]);
          const list = got.result.methodResponses?.find(x => x[0] === 'x:Account/get')?.[1]?.list || [];
          return json(res, 200, { mailboxes: list.map(a => ({ id: a.id, name: a.emailAddress || (a.name + '@' + (a.domainName || '')), email: a.emailAddress, description: a.description, type: a['@type'] })) });
        }
        if (p === '/api/mail/mailboxes' && req.method === 'POST') {
          const d = await mailJsonBody(), email = String(d.email || '').trim().toLowerCase(), password = String(d.password || '');
          if (!/^[^ @]+@[^ @]+[.][^ @]+$/.test(email) || password.length < 12 || password.length > 256) return json(res, 422, { error: 'Adresse invalide et mot de passe de 12 à 256 caractères requis.' });
          const [local, domain] = email.split('@');
          const dq = await jmap([['x:Domain/query', { filter: { name: domain } }, 'q']]);
          const domainId = dq.result.methodResponses?.find(x => x[0] === 'x:Domain/query')?.[1]?.ids?.[0];
          if (!domainId) return json(res, 422, { error: 'Ajoutez d’abord ce domaine dans l’onglet Domaines.' });
          const created = await jmap([['x:Account/set', { create: { newAccount: { '@type': 'User', name: local, domainId, credentials: [{ '@type': 'Password', secret: password }], memberGroupIds: {}, roles: { '@type': 'User' }, permissions: { '@type': 'Inherit' }, quotas: {}, aliases: {}, encryptionAtRest: { '@type': 'Disabled' } } } }, 'set']]);
          const payload = created.result.methodResponses?.find(x => x[0] === 'x:Account/set')?.[1];
          if (payload?.notCreated?.newAccount) return json(res, 502, { error: 'Stalwart a refusé la création du compte. Vérifiez le schéma et les permissions x:Account/set.' });
          return json(res, 201, { mailbox: payload?.created?.newAccount || {} });
        }
        if (p.startsWith('/api/mail/mailboxes/') && req.method === 'DELETE') {
          const id = decodeURIComponent(p.slice('/api/mail/mailboxes/'.length));
          if (!/^[a-zA-Z0-9._-]{1,128}$/.test(id)) return json(res, 400, { error: 'Identifiant de boîte invalide.' });
          const result = await jmap([['x:Account/set', { destroy: [id] }, 'set']]);
          const payload = result.result.methodResponses?.find(x => x[0] === 'x:Account/set')?.[1];
          if (payload?.notDestroyed?.[id]) return json(res, 502, { error: 'Stalwart n’a pas supprimé ce compte.' });
          return json(res, 200, { deleted: true });
        }
        if (p === '/api/mail/domains' && req.method === 'GET') {
          const q = await jmap([['x:Domain/query', { filter: {} }, 'q']]);
          const ids = q.result.methodResponses?.find(x => x[0] === 'x:Domain/query')?.[1]?.ids || [];
          if (!ids.length) return json(res, 200, { domains: [] });
          const got = await jmap([['x:Domain/get', { ids }, 'g']]);
          const list = got.result.methodResponses?.find(x => x[0] === 'x:Domain/get')?.[1]?.list || [];
          return json(res, 200, { domains: list.map(d => ({ id: d.id, name: d.name, description: d.description })) });
        }
        if (p === '/api/mail/domains' && req.method === 'POST') {
          const d = await mailJsonBody(), domain = String(d.domain || '').trim().toLowerCase();
          if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$/.test(domain)) return json(res, 422, { error: 'Nom de domaine invalide.' });
          const created = await jmap([['x:Domain/set', { create: { newDomain: { name: domain, aliases: {}, certificateManagement: { '@type': 'Manual' }, dnsManagement: { '@type': 'Manual' }, subAddressing: { '@type': 'Enabled' } } } }, 'set']]);
          const payload = created.result.methodResponses?.find(x => x[0] === 'x:Domain/set')?.[1];
          if (payload?.notCreated?.newDomain) return json(res, 502, { error: 'Stalwart a refusé la création du domaine.' });
          return json(res, 201, { domain: payload?.created?.newDomain || {} });
        }
        if (p.startsWith('/api/mail/domains/') && req.method === 'DELETE') {
          const id = decodeURIComponent(p.slice('/api/mail/domains/'.length));
          if (!/^[a-zA-Z0-9._-]{1,128}$/.test(id)) return json(res, 400, { error: 'Identifiant de domaine invalide.' });
          const result = await jmap([['x:Domain/set', { destroy: [id] }, 'set']]);
          const payload = result.result.methodResponses?.find(x => x[0] === 'x:Domain/set')?.[1];
          if (payload?.notDestroyed?.[id]) return json(res, 502, { error: 'Stalwart n’a pas supprimé ce domaine.' });
          return json(res, 200, { deleted: true });
        }
        return json(res, 405, { error: 'Méthode non autorisée.' }, { Allow: 'GET, POST, DELETE' });
      }
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
      // Fichiers statiques : liste blanche appliquée au chemin RÉSOLU (et non au chemin brut),
      // sinon `/css/..%2F.env` passerait le filtre puis serait normalisé vers `.env`.
      let rel; try { rel = decodeURIComponent(p === '/' ? '/index.html' : p); } catch { return json(res, 404, { error: 'introuvable' }); }
      const file = path.resolve(ROOT, '.' + rel), top = path.relative(ROOT, file).split(path.sep)[0];
      if (rel.includes('\0') || !file.startsWith(ROOT + path.sep) || !PUBLIC.has(top) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'introuvable' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { json(res, e.status || 500, { error: e.status ? e.message : 'Erreur serveur' }); }
  });
}
module.exports = { createServer, sign, unsign, verifySig, notifyBody, checkDns };
if (require.main === module) createServer().listen(E.PORT || 3000, () => console.log('Deploy sur http://localhost:' + (E.PORT || 3000)));
