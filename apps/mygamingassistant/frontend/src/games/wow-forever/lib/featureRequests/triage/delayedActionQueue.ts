/**
 * The undo window behind Approve, Not planned, Hide and status changes: an action waits `delayMs`, then
 * runs. Undo before then cancels it with no network call. A 429 doesn't drop it: it (and anything due
 * meanwhile) waits out Retry-After and is sent again. Framework-free so it can be tested with fake timers.
 */
import { rateLimitSeconds } from "@/games/wow-forever/lib/featureRequests/triage/triageErrors";
import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";
import type { DelayedActionHandlers } from "@/games/wow-forever/types/featureRequests/triage/delayedActionHandlers";
import type { DelayedActionPhase } from "@/games/wow-forever/types/featureRequests/triage/delayedActionPhase";
import type { DelayedActionQueue } from "@/games/wow-forever/types/featureRequests/triage/delayedActionQueue";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";

interface Entry {
  action: DelayedAction;
  phase: DelayedActionPhase;
  timer: ReturnType<typeof setTimeout> | null;
}

const NO_HANDLERS: DelayedActionHandlers = {
  onChange: () => undefined,
  onSuccess: () => undefined,
  onFailure: () => undefined,
  onRateLimited: () => undefined,
};

export function createDelayedActionQueue(delayMs: number, initial: DelayedActionHandlers = NO_HANDLERS): DelayedActionQueue {
  const entries = new Map<string, Entry>();
  let handlers = initial;
  let rateLimitedUntil: number | null = null;

  const snapshot = (): PendingDelayedAction[] =>
    [...entries.values()].map((e) => ({ id: e.action.id, label: e.action.label, phase: e.phase }));
  const changed = () => handlers.onChange(snapshot());

  function arm(action: DelayedAction, delay: number, phase: DelayedActionPhase): void {
    const existing = entries.get(action.id);
    if (existing?.timer != null) clearTimeout(existing.timer);
    const timer = setTimeout(() => void execute(action.id, false), delay);
    entries.set(action.id, { action, phase, timer });
    changed();
  }

  async function execute(id: string, onPageHide: boolean): Promise<void> {
    const entry = entries.get(id);
    if (entry === undefined || entry.phase === "running") return;
    const waitMs = rateLimitedUntil === null ? 0 : rateLimitedUntil - Date.now();
    if (waitMs > 0 && !onPageHide) {
      arm(entry.action, waitMs, "retrying");
      return;
    }
    if (entry.timer !== null) clearTimeout(entry.timer);
    entries.set(id, { ...entry, phase: "running", timer: null });
    changed();
    try {
      await entry.action.run();
      entries.delete(id);
      changed();
      handlers.onSuccess(entry.action);
    } catch (error) {
      const wait = rateLimitSeconds(error);
      if (wait !== null && !onPageHide) {
        rateLimitedUntil = Date.now() + wait * 1000;
        handlers.onRateLimited(rateLimitedUntil);
        arm(entry.action, wait * 1000, "retrying");
        setTimeout(() => {
          if (rateLimitedUntil !== null && rateLimitedUntil <= Date.now()) {
            rateLimitedUntil = null;
            handlers.onRateLimited(null);
          }
        }, wait * 1000);
        return;
      }
      entries.delete(id);
      changed();
      handlers.onFailure({ action: entry.action, error, onPageHide });
    }
  }

  return {
    schedule(action) {
      arm(action, delayMs, "waiting");
    },
    undo(id) {
      const entry = entries.get(id);
      if (entry === undefined || entry.phase === "running") return false;
      if (entry.timer !== null) clearTimeout(entry.timer);
      entries.delete(id);
      changed();
      return true;
    },
    async flush(id, onPageHide = false) {
      const ids = id === undefined ? [...entries.keys()] : [id];
      for (const next of ids) await execute(next, onPageHide);
    },
    pending: snapshot,
    setHandlers(next) {
      handlers = next;
    },
  };
}
