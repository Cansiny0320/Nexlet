import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { systemCommands } from '../src/main/system-commands';
import { ToolIcon } from '../src/renderer/common';

it.each(['win32', 'darwin'])('%s system actions each render distinct generated artwork even when native icons arrive', platform => {
  const actions = systemCommands(platform, platform === 'win32' ? '10.0.22631' : '22.0.0').filter(c => c.id.startsWith('system:action:'));
  expect(actions).toHaveLength(6);
  const sources = new Set<string>();
  for (const command of actions) {
    const markup = renderToStaticMarkup(createElement(ToolIcon, { command: { ...command, icon: 'data:image/png;base64,native' } }));
    expect(markup, command.id).toContain('<img');
    expect(markup, command.id).not.toContain('data:image/png;base64,native');
    expect(markup, command.id).not.toContain('<svg');
    const source = markup.match(/src="([^"]+)"/)?.[1];
    expect(source, command.id).toBeTruthy();
    expect(sources.has(source!), command.id).toBe(false);
    sources.add(source!);
  }
});

it('unknown future system actions retain a visible fallback', () => {
  const command = systemCommands('win32', '10.0.22631').find(c => c.id === 'system:action:shutdown')!;
  expect(renderToStaticMarkup(createElement(ToolIcon, { command: { ...command, id: 'system:action:future' } }))).toContain('<svg');
});
