export interface OcrIndexTask {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  error?: string;
}
