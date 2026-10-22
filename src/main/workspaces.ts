import { t } from '../shared/i18n';
import type { Workspace, WorkspaceItem, WorkspaceResult } from '../shared/productivity';

export class WorkspaceRunner {
  private results = new Map<string, WorkspaceResult[]>();
  read(id: string) {
    return structuredClone(this.results.get(id) || []);
  }
  private active = new Map<string, AbortController>();
  constructor(
    private execute: (item: WorkspaceItem) => Promise<void>,
    private progress: (id: string, results: WorkspaceResult[]) => void = () => {},
  ) {}
  async run(
    workspace: Workspace,
    selected = workspace.items.map((item) => item.id),
  ): Promise<WorkspaceResult[]> {
    if (this.active.has(workspace.id)) throw Error(t('工作区正在运行'));
    const controller = new AbortController();
    this.active.set(workspace.id, controller);
    const items = workspace.items.filter((item) => selected.includes(item.id));
    const results: WorkspaceResult[] = items.map((item) => ({ id: item.id, status: 'pending' }));
    this.results.delete(workspace.id);
    this.results.set(workspace.id, results);
    while (this.results.size > 100) this.results.delete(this.results.keys().next().value!);
    try {
      for (const [index, item] of items.entries()) {
        if (controller.signal.aborted) {
          results[index].status = 'cancelled';
          continue;
        }
        results[index].status = 'running';
        this.progress(workspace.id, structuredClone(results));
        try {
          await this.execute(item);
          results[index].status = 'success';
        } catch (error) {
          results[index] = {
            id: item.id,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          };
        }
        this.progress(workspace.id, structuredClone(results));
      }
      this.progress(workspace.id, structuredClone(results));
      return results;
    } finally {
      this.active.delete(workspace.id);
    }
  }
  cancel(id: string) {
    this.active.get(id)?.abort();
  }
  close() {
    for (const active of this.active.values()) active.abort();
  }
}
