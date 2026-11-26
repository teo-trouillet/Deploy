const test = require('node:test'), assert = require('node:assert'), crypto = require('node:crypto');
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
  } finally { srv.close(); }
});
