import type { ClipItem } from './types';

export const CLIP_PAGE_SIZE = 40;
export interface ClipSummary extends Omit<ClipItem, 'hash'> { textLength:number; }
export interface ClipIndex { ids:string[]; revision:number; }
export interface ClipPage { items:ClipSummary[]; revision:number; stale?:boolean; }
