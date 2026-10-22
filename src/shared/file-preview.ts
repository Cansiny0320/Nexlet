export type FilePreview =
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'image'; data: string; width: number; height: number }
  | { kind: 'unavailable'; reason: string };
