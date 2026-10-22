import { t } from '../shared/i18n';
import {
  defaultProductivity,
  validateProductivity,
  type ProductivityConfig,
} from '../shared/productivity';
import type { Command } from '../shared/types';

interface Storage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
export class Productivity {
  constructor(private store: Storage) {}
  read() {
    return this.store.get('productivity', defaultProductivity());
  }
  save(value: unknown): ProductivityConfig {
    const next = validateProductivity(value),
      previous = this.read();
    if (next.revision !== previous.revision) throw Error(t('配置已在其他窗口修改，请刷新后重试'));
    next.revision++;
    this.store.set('productivity', next);
    return next;
  }
  commands(): Command[] {
    const config = this.read();
    return [
      ...config.snippets.map((item): Command => ({
        id: 'snippet:' + item.id,
        kind: 'snippet',
        name: item.name,
        subtitle: item.group || t('快捷短语'),
        keywords: [item.group],
        color: '#699580',
      })),
      ...config.workspaces.map((item): Command => ({
        id: 'workspace:' + item.id,
        kind: 'workspace',
        name: item.name,
        subtitle: t('工作区'),
        keywords: ['workspace'],
        color: '#558e9b',
      })),
    ];
  }
}
