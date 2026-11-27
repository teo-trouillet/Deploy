const test = require('node:test'), assert = require('node:assert'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const { createServer, sign, unsign, verifySig, notifyBody, checkDns } = require('../server/server.js');

test('cookies signés : altération détectée', () => {
  assert.strictEqual(unsign(sign('abc')), 'abc');
  assert.strictEqual(unsign(sign('abc').replace('abc', 'abd')), null);
  assert.strictEqual(unsign(undefined), null);
});
test('signature webhook GitHub', () => {
  const raw = '{"a":1}', good = 'sha256=' + crypto.createHmac('sha256', 's').update(raw).digest('hex');
  assert.ok(verifySig('s', raw, good)); assert.ok(!verifySig('s', raw, 'sha256=00')); assert.ok(!verifySig('x', raw, good));
});
test('notification : seulement les échecs terminés', () => {
  const ev = (c, a = 'completed') => ({ action: a, repository: { full_name: 'o/r' }, workflow_run: { conclusion: c, head_branch: 'main', head_sha: 'abcdef123', html_url: 'u' } });
  assert.match(notifyBody(ev('failure')).text, /o\/r/); assert.strictEqual(notifyBody(ev('success')), null); assert.strictEqual(notifyBody(ev('failure', 'requested')), null);
});
test('DNS : CNAME et IP GitHub Pages', async () => {
  assert.ok((await checkDns('a.fr', 'Teo', { resolveCname: async () => ['teo.github.io.'] })).ok);
  assert.ok(!(await checkDns('a.fr', 'teo', { resolveCname: async () => ['autre.com'] })).ok);
  const ko = async () => { throw new Error('x'); };
  assert.ok((await checkDns('a.fr', 'teo', { resolveCname: ko, resolve4: async () => ['185.199.108.153'] })).ok);
  assert.ok(!(await checkDns('a.fr', 'teo', { resolveCname: ko, resolve4: async () => ['1.2.3.4'] })).ok);
});
test('HTTP : auth, CSRF, fichiers internes protégés', async () => {
  const srv = createServer().listen(0); const b = 'http://127.0.0.1:' + srv.address().port;
  try {
    assert.strictEqual((await fetch(b + '/api/me')).status, 401);
    assert.strictEqual((await fetch(b + '/api/secrets', { method: 'POST', body: '{}' })).status, 403);
    assert.strictEqual((await fetch(b + '/api/gh/user')).status, 401);
    assert.strictEqual((await fetch(b + '/webhook/github', { method: 'POST', body: '{}' })).status, 401);
    assert.strictEqual((await fetch(b + '/server/server.js')).status, 404);
    assert.strictEqual((await fetch(b + '/js/../package.json')).status, 404);
    assert.strictEqual((await fetch(b + '/')).status, 200);
    assert.strictEqual((await fetch(b + '/healthz')).status, 200);
    assert.strictEqual((await fetch(b + '/.env.example')).status, 404);
    assert.strictEqual((await fetch(b + '/.github/workflows/ci.yml')).status, 404);
  } finally { srv.close(); }
});

test('index.html : chaque CSS/JS local référencé existe et est servi', async () => {
  const root = path.join(__dirname, '..'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 5, 'au moins 2 CSS et 3 JS attendus');
  const srv = createServer().listen(0), b = 'http://127.0.0.1:' + srv.address().port;
  try {
    for (const r of refs) { assert.ok(fs.existsSync(path.join(root, r)), 'fichier manquant : ' + r); assert.strictEqual((await fetch(b + '/' + r)).status, 200, r); }
  } finally { srv.close(); }
});
test('index.html : lucide épinglé et icône inexistante retirée', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!html.includes('lucide@latest'), 'lucide doit être épinglé');
  assert.ok(!html.includes('square-arrow-left-enter'));
});

test('HTTP : pas de traversée de chemin (%2F) vers .env / server', async () => {
  const env = path.join(__dirname, '..', '.env'), had = fs.existsSync(env);
  if (!had) fs.writeFileSync(env, 'SECRET=1');
  const srv = createServer().listen(0), b = 'http://127.0.0.1:' + srv.address().port;
  try {
    for (const u of ['/css/..%2F.env', '/js/..%2Fserver%2Fserver.js', '/css/..%2fpackage.json', '/%2e%2e%2f.env', '/index.html%00'])
      assert.strictEqual((await fetch(b + u)).status, 404, u);
    assert.strictEqual((await fetch(b + '/')).status, 200);
    assert.strictEqual((await fetch(b + '/js/app.js')).status, 200);
  } finally { srv.close(); if (!had) fs.unlinkSync(env); }
});
