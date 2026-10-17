import { expect, it } from 'vite-plus/test';
import {
  everythingArguments,
  parseEverythingResults,
  everythingConfig,
} from '../src/shared/everything';

it('keeps search text after the end-of-options marker', () => {
  const args = everythingArguments('-exit -reindex "中文 文件"', 'D:\\cache\\result.json', '1.5a');
  expect(args.slice(-2)).toEqual(['--', '-exit -reindex "中文 文件"']);
  expect(args).toContain('-argv');
  expect(args).toContain('-export-json');
  expect(() => everythingArguments('a\0b', 'x')).toThrow();
});
it('reads ES JSON while rejecting relative paths and excessive result counts', () => {
  expect(parseEverythingResults('')).toEqual([]);
  const result = parseEverythingResults(
    '\ufeff' +
      JSON.stringify([
        {
          filename: 'D:\\资料\\中文.txt',
          size: 123,
          date_modified: '2026-10-12T00:00:00',
          attributes: 32,
        },
        { filename: 'D:\\资料\\', size: null, attributes: 16 },
      ]),
  );
  expect(result[0]).toMatchObject({
    name: '中文.txt',
    path: 'D:\\资料\\中文.txt',
    size: 123,
    directory: false,
  });
  expect(result[1].directory).toBe(true);
  expect(() => parseEverythingResults('[{"filename":"../secret"}]')).toThrow();
  expect(() =>
    parseEverythingResults(JSON.stringify(Array(201).fill({ filename: 'D:\\a' }))),
  ).toThrow();
});
it('isolates indexing and escapes commas and Windows path separators in configuration', () => {
  const config = everythingConfig(['D:\\a,b\\中文 文件']);
  expect(config).toContain('folders="D:\\\\a,b\\\\中文 文件"');
  expect(config).toContain('auto_include_fixed_volumes=0');
  expect(config).toContain('run_as_admin=0');
  expect(config).toContain('http_server_enabled=0');
  expect(() => everythingConfig(['D:\\x\nrun_as_admin=1'])).toThrow();
});
