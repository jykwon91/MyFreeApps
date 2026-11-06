import { TRIAGE_CRITERIA_MAX_ITEMS } from "@/games/wow-forever/data/featureRequests/triage/triageLimits";
import type { TriageEditDraft } from "@/games/wow-forever/types/featureRequests/triage/triageEditDraft";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import type { TriageStoryPatch } from "@/games/wow-forever/types/featureRequests/triage/triageStoryPatch";

/**
 * The edit form for a story. `extraLine` (a duplicate submission's "They also noted") is added as a new
 * acceptance-criteria line when there's room, else as a follow-up.
 */
export function draftFromStory(story: TriageStory, extraLine: string | null = null): TriageEditDraft {
  const criteria = [...story.acceptance_criteria];
  const followUps = [...story.follow_ups];
  if (extraLine !== null && extraLine.trim() !== "") {
    if (criteria.length < TRIAGE_CRITERIA_MAX_ITEMS) criteria.push(extraLine.trim());
    else followUps.push(extraLine.trim());
  }
  return {
    title: story.title,
    persona: story.persona,
    i_want: story.i_want,
    so_that: story.so_that,
    acceptance_criteria: criteria,
    follow_ups: followUps,
    area: story.area,
    topic: story.topic ?? "",
    feasibility: story.feasibility,
    feasibility_note: story.feasibility_note ?? "",
    priority: story.priority,
    operator_note: story.operator_note ?? "",
  };
}

function optional(text: string): string | null {
  const t = text.trim();
  return t === "" ? null : t;
}

function lines(items: readonly string[]): string[] {
  return items.map((i) => i.trim()).filter((i) => i !== "");
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Only what changed between the story and the form — the PATCH body (empty = nothing to save). Pure. */
export function patchFromDraft(story: TriageStory, draft: TriageEditDraft): TriageStoryPatch {
  const patch: TriageStoryPatch = {};
  const title = draft.title.trim();
  const persona = draft.persona.trim();
  const iWant = draft.i_want.trim();
  const soThat = draft.so_that.trim();
  if (title !== story.title) patch.title = title;
  if (persona !== story.persona) patch.persona = persona;
  if (iWant !== story.i_want) patch.i_want = iWant;
  if (soThat !== story.so_that) patch.so_that = soThat;
  const criteria = lines(draft.acceptance_criteria);
  if (!sameList(criteria, story.acceptance_criteria)) patch.acceptance_criteria = criteria;
  const followUps = lines(draft.follow_ups);
  if (!sameList(followUps, story.follow_ups)) patch.follow_ups = followUps;
  if (draft.area !== story.area) patch.area = draft.area;
  const topic = optional(draft.topic);
  if (topic !== story.topic) patch.topic = topic;
  if (draft.feasibility !== story.feasibility) patch.feasibility = draft.feasibility;
  const feasibilityNote = optional(draft.feasibility_note);
  if (feasibilityNote !== story.feasibility_note) patch.feasibility_note = feasibilityNote;
  if (draft.priority !== story.priority) patch.priority = draft.priority;
  const operatorNote = optional(draft.operator_note);
  if (operatorNote !== story.operator_note) patch.operator_note = operatorNote;
  return patch;
}

/** The required story text is filled in. */
export function isDraftComplete(draft: TriageEditDraft): boolean {
  return [draft.title, draft.persona, draft.i_want, draft.so_that].every((t) => t.trim() !== "");
}
