import { expect, it } from 'vitest';
import { validateMarketIndex, marketAvailability } from '../src/shared/marketplace';

const entry = { id: 'org.nexlet.hello', name: '便笺', description: '独立便笺', version: '1.0.0', author: 'Nexlet', category: '效率', platforms: ['win32', 'darwin'], minHostVersion: '0.1.0', download: 'https://github.com/Cansiny0320/Nexlet-plugins/releases/download/v1.0.0/hello.nexlet' };
it('accepts a versioned GitHub index without requiring a hash', () => { expect(validateMarketIndex({schemaVersion:1,plugins:[entry]}).plugins[0]).toEqual(entry); });
it('rejects untrusted download URLs, duplicate IDs and invalid versions', () => {
  for (const item of [{...entry,download:'https://evil.test/plugin.zip'},{...entry,download:'https://github.com/other/repo/releases/download/v1/a.zip'},{...entry,version:'01.0.0'}]) expect(()=>validateMarketIndex({schemaVersion:1,plugins:[item]})).toThrow();
  expect(()=>validateMarketIndex({schemaVersion:1,plugins:[entry,entry]})).toThrow();
});
it('checks platform, host version and upgrades without replacing development plugins', () => {
  const item=validateMarketIndex({schemaVersion:1,plugins:[entry]}).plugins[0];
  expect(marketAvailability(item,'linux','0.2.0')).toContain('平台');
  expect(marketAvailability(item,'win32','0.0.1')).toContain('0.1.0');
  expect(marketAvailability(item,'win32','0.2.0',{development:true,version:'0.1.0'})).toContain('开发');
  expect(marketAvailability(item,'win32','0.2.0',{development:false,version:'2.0.0'})).toContain('更新');
  expect(marketAvailability(item,'win32','0.2.0',{development:false,version:'0.9.0'})).toBeNull();
});
