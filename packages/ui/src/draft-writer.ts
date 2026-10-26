import type { LocalDraft } from '@cosmos/fs/drafts';

type Operation = { id: string; scope: string; draft: LocalDraft | null };
type Store = {
  put(draft: LocalDraft): Promise<void>;
  remove(id: string, scope: string): Promise<void>;
};
export type DraftStatus = 'saving' | 'protected' | 'failed' | 'clean';

/** At most one pending snapshot per editor; intermediate keystrokes are coalesced. */
export class DraftWriter {
  private pending = new Map<string, Operation>();
  private failed = new Map<string, Operation>();
  private running: Promise<void> | null = null;
  constructor(
    private store: Store,
    private changed: (
      id: string,
      status: DraftStatus,
      failures: number,
      snapshot: LocalDraft | null,
    ) => void,
  ) {}
  enqueue(id: string, scope: string, draft: LocalDraft | null) {
    this.failed.delete(id);
    this.pending.set(id, { id, scope, draft });
    this.changed(id, 'saving', this.failed.size, draft);
    this.start();
  }
  retry() {
    for (const op of this.failed.values()) {
      this.pending.set(op.id, op);
      this.changed(op.id, 'saving', 0, op.draft);
    }
    this.failed.clear();
    this.start();
  }
  async flush() {
    while (this.running) await this.running;
  }
  private start() {
    if (this.running) return;
    this.running = this.drain().finally(() => {
      this.running = null;
      if (this.pending.size) this.start();
    });
  }
  private async drain() {
    while (this.pending.size) {
      const op = this.pending.values().next().value;
      if (!op) break;
      this.pending.delete(op.id);
      try {
        if (op.draft) await this.store.put(op.draft);
        else await this.store.remove(op.id, op.scope);
        if (!this.pending.has(op.id))
          this.changed(
            op.id,
            op.draft ? 'protected' : 'clean',
            this.failed.size,
            op.draft,
          );
      } catch {
        if (!this.pending.has(op.id)) {
          this.failed.set(op.id, op);
          this.changed(op.id, 'failed', this.failed.size, op.draft);
        }
      }
    }
  }
}
