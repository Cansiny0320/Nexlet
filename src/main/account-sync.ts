import { t } from '../shared/i18n';
import {
  SYNC_CATEGORIES,
  type AccountAction,
  type AccountState,
  type SyncRecord,
} from '../shared/account-sync';
import type { HostSecrets } from './host-secrets';
import type { Store } from './store';
import { SyncEngine, type SyncAdapter } from './sync-engine';
import type { Fetcher } from './plugin-sdk/providers';

export const ACCOUNT_URL = 'https://161.33.217.59:8443/nexlet';
class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const errorLabels: Record<string, string> = {
  login_required: '请先登录',
  session_expired: '登录已过期，请重新登录',
  quota_exceeded: '云端空间已满，本地数据仍然保留',
  record_limit: '云端条目数量已达上限',
  record_too_large: '同步条目超过大小限制',
  rate_limited: '同步请求过于频繁，请稍后重试',
  service_capacity_exceeded: '同步服务空间不足，本地内容仍然保留，请稍后重试',
  recent_login_required: '删除账号前请重新登录，登录后 10 分钟内可以删除',
};
export class AccountSync {
  private user: AccountState['user'];
  private engine: SyncEngine | null = null;
  private controller = new AbortController();
  private loginController: AbortController | null = null;
  private loginState: AccountState['login'];
  private running = false;
  private error = '';
  private persistent = true;
  private timer: ReturnType<typeof setInterval> | undefined;
  private devices: AccountState['devices'] = [];
  constructor(
    private store: Store,
    private secrets: HostSecrets,
    private adapter: SyncAdapter,
    private fetcher: Fetcher,
    private open: (url: string) => Promise<void>,
    private changed: () => void,
    private applyChanges: () => Promise<void>,
    private mapDevice: (input: Extract<AccountAction, { action: 'mapping' }>) => Promise<void>,
    private base = ACCOUNT_URL,
  ) {
    this.user = store.get<AccountState['user']>('account-user', null);
    if (this.user) this.engine = new SyncEngine(store, this.user.id, adapter);
  }
  state(): AccountState {
    const state = this.engine?.read();
    const manifests = this.store.get<Record<string, AccountState['pluginSuggestions']>>(
      'sync-plugin-manifests',
      {},
    );
    const mapping = this.store.get<
      Record<
        string,
        {
          platform: string;
          entry?: { path: string; name: string };
          preference?: { shortcut: string };
        }
      >
    >('sync-device-mappings', {});
    return {
      user: this.user,
      login: this.loginState,
      enabled: state?.enabled ?? [],
      pending: Object.keys(state?.outbox ?? {}).length,
      conflicts: Object.values(state?.conflicts ?? {}),
      used: state?.used ?? 0,
      quota: state?.quota ?? 100 * 1024 * 1024,
      running: this.running,
      error: this.error,
      persistent: this.persistent,
      devices: this.devices,
      pluginSuggestions: [
        ...new Map(
          Object.values(manifests)
            .flat()
            .map((p) => [p.id, p]),
        ).values(),
      ],
      mappings: Object.entries(mapping).map(([id, value]) => ({
        id,
        platform: value.platform,
        path: value.entry?.path,
        name: value.entry?.name,
        shortcut: value.preference?.shortcut,
      })),
    };
  }
  start() {
    this.timer = setInterval(() => {
      try {
        if (this.user && this.secrets.get('account-session')) this.engine?.capture();
      } catch (error) {
        this.error = (error as Error).message;
        this.changed();
      }
      void this.sync();
    }, 30000);
    this.timer.unref();
    void this.sync();
  }
  private async request(
    route: string,
    body: unknown,
    signal: AbortSignal,
    token?: string,
    method?: string,
  ): Promise<any> {
    signal.throwIfAborted();
    const response = await this.fetcher(this.base + route, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Nexlet desktop',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    signal.throwIfAborted();
    const reader = response.body?.getReader();
    if (!reader) throw new Error(t('账号服务没有返回数据'));
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 12 * 1024 * 1024) throw new Error(t('账号服务响应过大'));
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok)
      throw new AccountError(data.error ?? data.message ?? t('账号服务请求失败'), response.status);
    return data;
  }
  private fail(error: unknown) {
    if (this.controller.signal.aborted) return;
    this.error = t(errorLabels[(error as Error).message] ?? (error as Error).message);
    this.changed();
  }
  private async login() {
    this.loginController?.abort();
    const controller = new AbortController();
    this.loginController = controller;
    this.error = '';
    const health = await this.request('/health', undefined, controller.signal);
    if (!health.loginConfigured)
      throw new Error(t('账号服务尚未配置 GitHub OAuth，请联系服务管理员'));
    const code = await this.request(
      '/auth/device/code',
      { client_id: 'nexlet-desktop' },
      controller.signal,
    );
    if (
      typeof code.device_code !== 'string' ||
      typeof code.user_code !== 'string' ||
      !Number.isFinite(code.expires_in)
    )
      throw new Error(t('设备登录响应无效'));
    const verification = new URL(code.verification_uri_complete);
    if (
      verification.origin !== new URL(this.base).origin ||
      verification.pathname !== new URL(this.base).pathname + '/device'
    )
      throw new Error(t('设备登录地址无效'));
    this.loginState = {
      code: code.user_code,
      expiresAt: Date.now() + Math.min(code.expires_in, 900) * 1000,
    };
    this.changed();
    await this.open(verification.href);
    void this.pollLogin(code, controller);
  }
  private async pollLogin(
    code: { device_code: string; interval?: number },
    controller: AbortController,
  ) {
    let interval = Math.max(5, Number(code.interval) || 5) * 1000;
    try {
      while (this.loginState && Date.now() < this.loginState.expiresAt) {
        await new Promise<void>((resolve, reject) => {
          const aborted = () => {
            clearTimeout(timer);
            reject(new Error(t('登录已取消')));
          };
          const timer = setTimeout(() => {
            controller.signal.removeEventListener('abort', aborted);
            resolve();
          }, interval);
          controller.signal.addEventListener('abort', aborted, { once: true });
          if (controller.signal.aborted) aborted();
        });
        let grant;
        try {
          grant = await this.request(
            '/auth/device/token',
            {
              client_id: 'nexlet-desktop',
              device_code: code.device_code,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            },
            controller.signal,
          );
        } catch (error) {
          if ((error as Error).message === 'authorization_pending') continue;
          if ((error as Error).message === 'slow_down') {
            interval += 5000;
            continue;
          }
          throw error;
        }
        if (typeof grant.access_token !== 'string') throw new Error(t('设备会话无效'));
        const user = await this.request(
          '/api/me',
          undefined,
          controller.signal,
          grant.access_token,
        );
        controller.signal.throwIfAborted();
        if (typeof user.id !== 'string' || typeof user.name !== 'string')
          throw new Error(t('账号信息无效'));
        this.controller.abort();
        this.controller = new AbortController();
        if (this.user?.id !== user.id) {
          this.engine?.clear();
          this.store.set('sync-device-mappings', {});
          this.store.set('sync-plugin-manifests', {});
        }
        this.persistent = this.secrets.set('account-session', grant.access_token).persistent;
        this.user = { id: user.id, name: user.name, image: user.image };
        this.store.set('account-user', this.user);
        this.engine = new SyncEngine(this.store, user.id, this.adapter);
        this.loginState = undefined;
        this.devices = [];
        this.changed();
        void this.sync();
        return;
      }
      throw new Error(t('设备代码已过期，请重新登录'));
    } catch (error) {
      if (!controller.signal.aborted) {
        this.error = (error as Error).message;
        this.loginState = undefined;
        this.changed();
      }
    }
  }
  async sync() {
    if (this.running || !this.user || !this.engine || this.controller.signal.aborted) return;
    let token: string | null;
    try {
      token = this.secrets.get('account-session');
    } catch (error) {
      this.fail(error);
      return;
    }
    if (!token) return;
    const engine = this.engine,
      signal = this.controller.signal,
      owner = this.user.id;
    this.running = true;
    this.error = '';
    this.changed();
    try {
      const user = await this.request('/api/me', undefined, signal, token);
      signal.throwIfAborted();
      if (user.id !== owner) throw new Error(t('会话账号不匹配'));
      engine.capture();
      let more = true;
      while (more) {
        let pull;
        try {
          pull = await this.request(
            '/api/sync/pull?cursor=' + engine.read().cursor,
            undefined,
            signal,
            token,
          );
        } catch (error) {
          if ((error as Error).message === 'cursor_reset_required') {
            engine.resetCursor();
            pull = await this.request('/api/sync/pull?cursor=0', undefined, signal, token);
          } else throw error;
        }
        signal.throwIfAborted();
        if (
          !Array.isArray(pull.records) ||
          pull.records.length > 50 ||
          !Number.isSafeInteger(pull.cursor) ||
          typeof pull.more !== 'boolean'
        )
          throw new Error(t('同步响应无效'));
        engine.pull(pull);
        more = pull.more;
      }
      for (const mutation of Object.values(engine.read().outbox).slice(0, 50)) {
        const result = await this.request('/api/sync/push', mutation, signal, token);
        signal.throwIfAborted();
        if (result.ok) engine.accepted(mutation, result);
        else if (result.conflict) engine.conflict(mutation, result.conflict as SyncRecord);
        else throw new Error(t('同步版本冲突，请重新拉取'));
      }
      await this.applyChanges();
    } catch (error) {
      if (!signal.aborted) {
        if (error instanceof AccountError && error.status === 401)
          this.secrets.set('account-session', null);
        this.fail(error);
      }
    } finally {
      this.running = false;
      this.changed();
    }
  }
  async action(input: AccountAction): Promise<AccountState> {
    try {
      if (input.action === 'state') return this.state();
      if (input.action === 'login') await this.login();
      else if (input.action === 'cancel') {
        this.loginController?.abort();
        this.loginState = undefined;
      } else if (input.action === 'sync') await this.sync();
      else {
        if (!this.user || !this.engine) throw new Error(t('请先登录'));
        if (input.action === 'categories') {
          if (
            !Array.isArray(input.enabled) ||
            input.enabled.some((k) => !SYNC_CATEGORIES.includes(k))
          )
            throw new Error(t('同步类别无效'));
          this.engine.categories(input.enabled);
          void this.sync();
        } else if (input.action === 'resolve') {
          if (!['local', 'remote'].includes(input.choice)) throw new Error(t('冲突选项无效'));
          this.engine.resolve(input.key, input.choice);
          await this.applyChanges();
          void this.sync();
        } else if (input.action === 'mapping') await this.mapDevice(input);
        else {
          const token = this.secrets.get('account-session');
          if (!token && input.action !== 'logout') throw new Error(t('请重新登录'));
          if (input.action === 'devices')
            this.devices = await this.request(
              '/api/devices',
              undefined,
              this.controller.signal,
              token!,
            );
          else if (input.action === 'revoke') {
            await this.request('/api/revoke', { id: input.id }, this.controller.signal, token!);
            if (this.devices.find((d) => d.id === input.id)?.current) this.clear();
            else
              this.devices = await this.request(
                '/api/devices',
                undefined,
                this.controller.signal,
                token!,
              );
          } else if (input.action === 'delete') {
            await this.request(
              '/api/account',
              { confirm: this.user.id },
              this.controller.signal,
              token!,
              'DELETE',
            );
            this.clear();
          } else if (input.action === 'logout') {
            this.controller.abort();
            this.loginController?.abort();
            try {
              if (token) await this.request('/api/logout', {}, AbortSignal.timeout(10000), token);
            } finally {
              this.clear();
            }
          }
        }
      }
    } catch (error) {
      this.error = t(errorLabels[(error as Error).message] ?? (error as Error).message);
    }
    this.changed();
    return this.state();
  }
  private clear() {
    this.controller.abort();
    this.controller = new AbortController();
    this.loginController?.abort();
    this.loginState = undefined;
    this.secrets.set('account-session', null);
    this.engine?.clear();
    this.engine = null;
    this.user = null;
    this.devices = [];
    this.error = '';
    this.store.set('account-user', null);
    this.store.set('sync-device-mappings', {});
    this.store.set('sync-plugin-manifests', {});
  }
  close() {
    clearInterval(this.timer);
    this.controller.abort();
    this.loginController?.abort();
  }
}
