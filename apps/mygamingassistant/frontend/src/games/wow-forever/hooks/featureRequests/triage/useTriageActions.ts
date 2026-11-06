/**
 * Every triage write, wired to the undo queue. Approve / Not planned / Hide on an inbox card and a
 * Planned / In progress / Reopen change wait TRIAGE_UNDO_MS (Undo cancels with no call); Merge, Got it,
 * Dismiss and the sheets' saves go at once. Approve sends the PATCH first and mark-triaged second, so a
 * failed PATCH never clears the submission.
 */
import { useCallback, useMemo, useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { triageApi } from "@/games/wow-forever/api/triageApi";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_UNDO_MS } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { TRIAGE_STATUS_LABEL } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import { useDelayedAction } from "@/games/wow-forever/hooks/featureRequests/triage/useDelayedAction";
import { triageErrorView } from "@/games/wow-forever/lib/featureRequests/triage/triageErrorView";
import { doneLabel, mergedIntoLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import { findTriageStory } from "@/games/wow-forever/lib/featureRequests/triage/triageStoryLookup";
import { triageStore } from "@/games/wow-forever/lib/featureRequests/triage/triageStore";
import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";
import type { DelayedActionFailure } from "@/games/wow-forever/types/featureRequests/triage/delayedActionFailure";
import type { InboxCardEdits } from "@/games/wow-forever/types/featureRequests/triage/inboxCardEdits";
import type { TriageErrorView } from "@/games/wow-forever/types/featureRequests/triage/triageErrorView";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageSettableStatus } from "@/games/wow-forever/types/featureRequests/triage/triageSettableStatus";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import type { TriageStoryPatch } from "@/games/wow-forever/types/featureRequests/triage/triageStoryPatch";

/** The freshest cached copy, so `If-Match` matches what the server has after an edit. */
function latest(story: TriageStory): TriageStory {
  const state = triageStore.getState();
  const inbox = triageApi.endpoints.getTriageInbox.select()(state).data;
  const stories = triageApi.endpoints.getTriageStories.select()(state).data;
  return findTriageStory(story.id, inbox, stories) ?? story;
}

async function patchStory(story: TriageStory, patch: TriageStoryPatch): Promise<TriageStory> {
  const current = latest(story);
  const request = triageStore.dispatch(
    triageApi.endpoints.patchTriageStory.initiate({ story: { id: current.id, updated_at: current.updated_at }, patch }),
  );
  try {
    return await request.unwrap();
  } finally {
    request.reset();
  }
}

async function markTriaged(submissionIds: string[]): Promise<void> {
  const request = triageStore.dispatch(triageApi.endpoints.markSubmissionsTriaged.initiate(submissionIds));
  try {
    await request.unwrap();
  } finally {
    request.reset();
  }
}

async function mergeStory(story: TriageStory, intoStoryId: string): Promise<void> {
  const current = latest(story);
  const request = triageStore.dispatch(
    triageApi.endpoints.mergeTriageStory.initiate({ story: { id: current.id, updated_at: current.updated_at }, intoStoryId }),
  );
  try {
    await request.unwrap();
  } finally {
    request.reset();
  }
}

/** Approve's PATCH: publish, plus the private row when it changed. */
function approvePatch(story: TriageStory, edits: InboxCardEdits): TriageStoryPatch {
  const patch: TriageStoryPatch = { status: "open" };
  if (edits.priority !== story.priority) patch.priority = edits.priority;
  if (edits.area !== story.area) patch.area = edits.area;
  return patch;
}

/** PATCH (once, even if mark-triaged is retried after a 429), then clear the submission. */
function patchThenMark(item: TriageInboxItem, story: TriageStory, patch: TriageStoryPatch): () => Promise<void> {
  let patched = false;
  return async () => {
    if (!patched) {
      await patchStory(story, patch);
      patched = true;
    }
    await markTriaged([item.submission_id]);
  };
}

const statusActionId = (storyId: string) => `story:${storyId}`;

export function useTriageActions() {
  const [finished, setFinished] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, TriageErrorView>>(() => new Map());
  const [optimisticStatus, setOptimisticStatus] = useState<ReadonlyMap<string, TriageSettableStatus>>(() => new Map());
  const [unsaved, setUnsaved] = useState<readonly DelayedAction[]>([]);

  const setError = useCallback((id: string, view: TriageErrorView | null) => {
    setErrors((prev) => {
      const next = new Map(prev);
      if (view === null) next.delete(id);
      else next.set(id, view);
      return next;
    });
  }, []);
  const dropOptimistic = useCallback((actionId: string) => {
    setOptimisticStatus((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) if (statusActionId(key) === actionId) next.delete(key);
      return next;
    });
  }, []);
  const finish = useCallback((id: string) => setFinished((prev) => new Set(prev).add(id)), []);

  const onSuccess = useCallback(
    (action: DelayedAction) => {
      dropOptimistic(action.id);
      finish(action.id);
      if (action.successMessage !== null) showSuccess(action.successMessage);
    },
    [dropOptimistic, finish],
  );
  const onFailure = useCallback(
    ({ action, error, onPageHide }: DelayedActionFailure) => {
      dropOptimistic(action.id);
      const view = triageErrorView(error);
      setError(action.id, view);
      if (onPageHide) setUnsaved((prev) => [...prev.filter((a) => a.id !== action.id), action]);
      else showError(view.message);
    },
    [dropOptimistic, setError],
  );
  const queue = useDelayedAction({ delayMs: TRIAGE_UNDO_MS, onSuccess, onFailure });

  const schedule = useCallback(
    (action: DelayedAction) => {
      setError(action.id, null);
      queue.schedule(action);
    },
    [queue, setError],
  );

  const approve = useCallback(
    (item: TriageInboxItem, story: TriageStory, edits: InboxCardEdits) =>
      schedule({
        id: item.submission_id,
        label: doneLabel("Approved", story.title),
        successMessage: TRIAGE_COPY.toastApproved,
        run: patchThenMark(item, story, approvePatch(story, edits)),
      }),
    [schedule],
  );
  const declineFromInbox = useCallback(
    (item: TriageInboxItem, story: TriageStory, note: string) =>
      schedule({
        id: item.submission_id,
        label: doneLabel("Not planned", story.title),
        successMessage: TRIAGE_COPY.toastNotPlanned,
        run: patchThenMark(item, story, { status: "not_planned", operator_note: note.trim() }),
      }),
    [schedule],
  );
  const hideFromInbox = useCallback(
    (item: TriageInboxItem, story: TriageStory) =>
      schedule({
        id: item.submission_id,
        label: doneLabel("Hidden", story.title),
        successMessage: TRIAGE_COPY.toastHidden,
        run: patchThenMark(item, story, { hidden: true }),
      }),
    [schedule],
  );
  /** Got it / Dismiss: clear the submission now, no undo. Resolves to an error view on failure. */
  const clearSubmission = useCallback(
    async (item: TriageInboxItem): Promise<TriageErrorView | null> => {
      try {
        await markTriaged([item.submission_id]);
        finish(item.submission_id);
        return null;
      } catch (error) {
        const view = triageErrorView(error);
        showError(view.message);
        return view;
      }
    },
    [finish],
  );
  /** Merge (from an inbox card) then clear the submission. No undo — the sheet confirms first. */
  const mergeFromInbox = useCallback(
    async (item: TriageInboxItem, story: TriageStory, target: TriageStory): Promise<TriageErrorView | null> => {
      try {
        await mergeStory(story, target.id);
        await markTriaged([item.submission_id]);
        finish(item.submission_id);
        showSuccess(mergedIntoLabel(target.title));
        return null;
      } catch (error) {
        return triageErrorView(error);
      }
    },
    [finish],
  );
  /** Planned / In progress / Reopen on the All requests tab: shown at once, sent after the undo window. */
  const changeStatus = useCallback(
    (story: TriageStory, status: TriageSettableStatus) => {
      setOptimisticStatus((prev) => new Map(prev).set(story.id, status));
      schedule({
        id: statusActionId(story.id),
        label: doneLabel(TRIAGE_STATUS_LABEL[status], story.title),
        successMessage: null,
        run: async () => {
          await patchStory(story, { status });
        },
      });
    },
    [schedule],
  );
  const undo = useCallback(
    (id: string) => {
      if (queue.undo(id)) dropOptimistic(id);
    },
    [queue, dropOptimistic],
  );
  /** A sheet's save (Shipped, Not planned, Edit, Hide / Unhide): at once; an error view on failure. */
  const saveStory = useCallback(
    async (story: TriageStory, patch: TriageStoryPatch, successMessage: string | null): Promise<TriageErrorView | null> => {
      try {
        await patchStory(story, patch);
        if (successMessage !== null) showSuccess(successMessage);
        return null;
      } catch (error) {
        return triageErrorView(error);
      }
    },
    [],
  );
  const retryUnsaved = useCallback(() => {
    const actions = unsaved;
    setUnsaved([]);
    for (const action of actions) {
      schedule(action);
      void queue.flush(action.id);
    }
  }, [unsaved, schedule, queue]);

  const pendingById = useMemo(() => new Map(queue.pending.map((p) => [p.id, p])), [queue.pending]);

  return {
    pendingById,
    rateLimitedUntil: queue.rateLimitedUntil,
    flushAll: () => queue.flush(),
    finished,
    errors,
    optimisticStatus,
    unsaved,
    approve,
    declineFromInbox,
    hideFromInbox,
    clearSubmission,
    mergeFromInbox,
    changeStatus,
    undo,
    saveStory,
    retryUnsaved,
    statusActionId,
  };
}

