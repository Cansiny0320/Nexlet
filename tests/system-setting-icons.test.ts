import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { systemCommands } from '../src/main/system-commands';
import { ToolIcon } from '../src/renderer/common';
import { systemSettingIcons } from '../src/renderer/system-setting-icons';
import type { Command } from '../src/shared/types';

const settings = (platform: string, release: string) => systemCommands(platform, release).filter(c => c.id.startsWith('system:settings:'));
const render = (command: Command) => renderToStaticMarkup(createElement(ToolIcon, { command }));

describe('系统设置图标', () => {
  it.each([['win32', '10.0.19045'], ['win32', '10.0.22631'], ['darwin', '22.0.0']])('%s %s 的每个设置均使用独立生成图', (platform, release) => {
    const images = new Set<string>();
    for (const command of settings(platform, release)) {
      const design = systemSettingIcons[command.id.slice('system:settings:'.length)];
      expect(design, command.id).toBeDefined();
      if (!design) throw new Error(`Missing setting icon: ${command.id}`);
      expect(typeof design, command.id).toBe('string');
      expect(images.has(design), command.id).toBe(false);
      images.add(design);
      expect(render(command), command.id).toContain(`src="${design}"`);
      expect(render(command), command.id).not.toContain('<svg');
    }
  });

  it('已知设置的生成图优先于目录提供的原生图像', () => {
    const command = settings('darwin', '22.0.0')[0];
    const markup = render({ ...command, icon: 'data:image/png;base64,native' });
    expect(markup).toContain('<img');
    expect(markup).not.toContain('data:image/png;base64,native');
    expect(markup).toContain(`src="${systemSettingIcons.about}"`);
    expect(markup).not.toContain('<svg');
  });

  it('unknown future settings retain a visible fallback', () => {
    const command = settings('win32', '10.0.22631')[0];
    expect(render({ ...command, id: 'system:settings:future' })).toContain('<svg');
    expect(render({ ...command, id: 'system:settings:future', icon: 'data:image/png;base64,native' })).toContain('data:image/png;base64,native');
  });

  it('其他应用的原生图像不受生成图优先级影响', () => {
    const command: Command = { id: 'app:example', name: 'Example', kind: 'app', subtitle: '', keywords: [], icon: 'data:image/png;base64,app' };
    expect(render(command)).toContain('data:image/png;base64,app');
  });
});
