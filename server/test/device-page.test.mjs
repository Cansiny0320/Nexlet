import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/device.js', import.meta.url), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function page(handler, language = 'zh-CN') {
  const elements = new Map(),
    calls = [],
    redirects = [];
  const get = (selector) => {
    if (!elements.has(selector))
      elements.set(selector, {
        value: '',
        textContent: '',
        disabled: false,
        hidden: ['#approve', '#deny', '#account'].includes(selector),
        dataset: {},
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      });
    return elements.get(selector);
  };
  const document = { documentElement: {}, querySelector: get };
  runInNewContext(source, {
    document,
    navigator: { language },
    URLSearchParams,
    location: {
      pathname: '/nexlet/device',
      origin: 'https://example.test',
      search: '?user_code=ABCD-EFGH',
      assign: (url) => redirects.push(url),
    },
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      const value = await handler(url, options);
      return { ok: !value?.error, json: async () => value };
    },
  });
  return { get, calls, redirects, document };
}
test('session shows the account without approving the device automatically', async () => {
  const p = page(() => ({ user: { name: '<b>demo-user</b>' } }));
  await flush();
  assert.equal(p.get('#identity').textContent.includes('<b>demo-user</b>'), true);
  assert.equal(p.get('#approve').hidden, false);
  assert.equal(p.get('#login').hidden, true);
  assert.equal(p.calls.length, 1);
  assert.equal(p.get('#code').value, 'ABCD-EFGH');
});
test('approval validates once and locks the submitted code during the request', async () => {
  let release;
  const p = page((url) =>
    url.endsWith('/get-session')
      ? { user: { name: 'demo-user' } }
      : url.includes('/device?')
        ? new Promise((resolve) => {
            release = resolve;
          })
        : {},
  );
  await flush();
  const first = p.get('#approve').onclick();
  await flush();
  const second = p.get('#approve').onclick();
  assert.equal(p.get('#code').disabled, true);
  assert.equal(p.get('#deny').disabled, true);
  release({});
  await Promise.all([first, second]);
  assert.equal(p.calls.filter((c) => c.url.endsWith('/device/approve')).length, 1);
  assert.deepEqual(JSON.parse(p.calls.at(-1).body), { userCode: 'ABCD-EFGH' });
  assert.equal(p.get('#approve').disabled, true);
});
test('failed validation never approves and allows a retry', async () => {
  let failing = true;
  const p = page((url) =>
    url.endsWith('/get-session')
      ? { user: { name: 'demo-user' } }
      : url.includes('/device?') && failing
        ? { error: true, message: 'Expired code' }
        : {},
  );
  await flush();
  await p.get('#approve').onclick();
  assert.equal(
    p.calls.some((c) => c.url.endsWith('/device/approve')),
    false,
  );
  assert.equal(p.get('#message').textContent, 'Expired code');
  assert.equal(p.get('#approve').disabled, false);
  failing = false;
  await p.get('#deny').onclick();
  assert.equal(p.calls.at(-1).url, '/nexlet/auth/device/deny');
  assert.equal(p.get('#deny').disabled, true);
});
test('GitHub sign-in preserves the deployment prefix and device code', async () => {
  const p = page(
    (url) => (url.endsWith('/get-session') ? null : { url: 'https://github.com/login' }),
    'en',
  );
  await flush();
  await p.get('#login').onclick();
  assert.equal(p.document.documentElement.lang, 'en');
  assert.deepEqual(JSON.parse(p.calls.at(-1).body), {
    provider: 'github',
    callbackURL: 'https://example.test/nexlet/device?user_code=ABCD-EFGH',
  });
  assert.deepEqual(p.redirects, ['https://github.com/login']);
});
