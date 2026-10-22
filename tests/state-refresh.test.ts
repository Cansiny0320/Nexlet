import { expect, it } from 'vite-plus/test';
import { retainSearchInputs } from '../src/renderer/state-refresh';
import type { AppState } from '../src/shared/types';

const state = {
  catalogRevision: 1,
  commands: [{ id: 'a', name: 'App', keywords: ['find'], matches: [{ type: 'text' }] }],
  recent: ['a'],
  update: { phase: 'idle' },
} as unknown as AppState;
it('无关状态保持搜索输入引用，命令内容和最近使用顺序变化使输入失效', () => {
  const next = { ...structuredClone(state), update: { ...state.update, percent: 50 } };
  expect(retainSearchInputs(state, next).commands).toBe(state.commands);
  expect(retainSearchInputs(state, next).recent).toBe(state.recent);
  next.commands[0].keywords = ['new alias'];
  expect(retainSearchInputs(state, next).commands).toBe(next.commands);
  next.recent = ['b', 'a'];
  expect(retainSearchInputs(state, next).recent).toBe(next.recent);
  expect(retainSearchInputs(state, { ...next, catalogRevision: 0 })).toBe(state);
});
