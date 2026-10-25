import { describe, expect, it } from 'vite-plus/test';
import { AccountSync } from '../src/main/account-sync';
import { HostSecrets } from '../src/main/host-secrets';
import type { Store } from '../src/main/store';
import type { Fetcher } from '../src/main/plugin-sdk/providers';

function fixture(fetcher: Fetcher, initialUser = false) {
  const values = new Map<string, unknown>();
  if (initialUser) values.set('account-user', { id: 'owner', name: 'Fixture' });
  const store = {
    get: <T>(key: string, fallback: T) => structuredClone(values.get(key) ?? fallback) as T,
    set: (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
  };
  const secrets = new HostSecrets(store, {
    isEncryptionAvailable: () => false,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString(),
  });
  if (initialUser) secrets.set('account-session', 'fixture-session');
  const opened: string[] = [];
  let applied = 0;
  const account = new AccountSync(
    store as Store,
    secrets,
    {
      snapshot: () => [],
      apply: () => {
        applied++;
      },
      transaction: (fn) => fn(),
    },
    fetcher,
    async (url) => {
      opened.push(url);
    },
    () => {},
    async () => {},
    async () => {},
    'https://example.invalid/nexlet',
  );
  return { account, secrets, opened, applied: () => applied };
}
describe('account request lifecycle without browser interaction', () => {
  it('does not open a browser for a late login response after cancellation', async () => {
    let finish!: (response: Response) => void;
    let count = 0;
    const f = fixture(async () => {
      count++;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const login = f.account.action({ action: 'login' });
    await f.account.action({ action: 'cancel' });
    finish(Response.json({ loginConfigured: true }));
    await login;
    expect(count).toBe(1);
    expect(f.opened).toEqual([]);
    expect(f.account.state().login).toBeUndefined();
    f.account.close();
  });
  it('rejects another owner before pulling data and forgets revoked tokens', async () => {
    const calls: string[] = [];
    let expired = false;
    const f = fixture(async (url) => {
      calls.push(String(url));
      return expired
        ? Response.json({ error: 'session_expired' }, { status: 401 })
        : Response.json({ id: 'other', name: 'Other' });
    }, true);
    await f.account.sync();
    expect(calls).toHaveLength(1);
    expect(f.applied()).toBe(0);
    expect(f.account.state().error).toContain('不匹配');
    expired = true;
    await f.account.sync();
    expect(f.secrets.get('account-session')).toBeNull();
    f.account.close();
  });
});
