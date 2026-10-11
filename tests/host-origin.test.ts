import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isHostDocument } from '../src/main/host-origin';

describe('host document identity', () => {
  const document = path.resolve('fixture/Long User/renderer/index.html');
  const short = path.resolve('fixture/LONGUS~1/renderer/index.html');
  const resolve = (file: string) => file === short ? document : file;
  it('accepts a canonical Windows short path with window query', () => {
    expect(isHostDocument(pathToFileURL(short).href + '?view=launcher', document, resolve, 'win32')).toBe(true);
  });
  it('rejects prefix matches, other documents and remote origins', () => {
    for (const url of [pathToFileURL(document + '.evil').href, 'https://example.com/index.html', 'file://server/share/index.html', 'not a URL']) expect(isHostDocument(url, document, resolve, 'win32')).toBe(false);
  });
});
