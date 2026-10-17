import { randomUUID } from 'node:crypto';

/** Single-use capabilities bound to a live plugin session. */
export class ClipboardGuard {
  private sessions = new Map<number, { token: string; stamp?: string }>();
  constructor(
    private stamp: () => Promise<string | null>,
    private writeText: (text: string) => Promise<void>,
  ) {}
  async snapshot(owner: number): Promise<string | null> {
    const entry = { token: randomUUID(), stamp: undefined as string | undefined };
    this.sessions.set(owner, entry);
    const stamp = await this.stamp();
    if (this.sessions.get(owner) !== entry) return null;
    if (stamp === null) {
      this.sessions.delete(owner);
      return null;
    }
    entry.stamp = stamp;
    return entry.token;
  }
  async write(owner: number, token: string, text: string): Promise<boolean> {
    const entry = this.sessions.get(owner);
    if (!entry || entry.token !== token || entry.stamp === undefined) return false;
    const expected = entry.stamp;
    entry.stamp = undefined;
    const current = await this.stamp();
    if (this.sessions.get(owner) !== entry) return false;
    this.sessions.delete(owner);
    if (current !== expected) return false;
    await this.writeText(text);
    return true;
  }
  close(owner: number): void {
    this.sessions.delete(owner);
  }
}
