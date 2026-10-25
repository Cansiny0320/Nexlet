import { PluginSecrets } from './plugin-secrets';

/** Separate storage namespace; plugin IDs can never address these credentials. */
export class HostSecrets {
  private secrets: PluginSecrets;
  constructor(
    store: ConstructorParameters<typeof PluginSecrets>[0],
    encryption: ConstructorParameters<typeof PluginSecrets>[1],
  ) {
    this.secrets = new PluginSecrets(
      {
        get: (key, fallback) => store.get('host:' + key, fallback),
        set: (key, value) => store.set('host:' + key, value),
      },
      encryption,
    );
  }
  get(name: string): string | null {
    return this.secrets.get('credentials', 0, name);
  }
  set(name: string, value: string | null): { persistent: boolean } {
    return this.secrets.set('credentials', 0, name, value);
  }
}
