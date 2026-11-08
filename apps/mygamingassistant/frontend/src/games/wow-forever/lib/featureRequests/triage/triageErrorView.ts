import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import {
  DETAIL_MERGE_CONFLICT,
  DETAIL_STORY_CHANGED,
  isTriageApiError,
  rateLimitSeconds,
} from "@/games/wow-forever/lib/featureRequests/triage/triageErrors";
import type { TriageErrorView } from "@/games/wow-forever/types/featureRequests/triage/triageErrorView";

/** The copy a failed triage write shows, and the form fields it points at. */
export function triageErrorView(error: unknown): TriageErrorView {
  if (!isTriageApiError(error)) return { message: TRIAGE_COPY.saveFailed, fields: [] };
  if (error.status === undefined) return { message: TRIAGE_COPY.network, fields: [] };
  if (rateLimitSeconds(error) !== null) return { message: TRIAGE_COPY.slowDown, fields: [] };
  if (error.status === 403) return { message: TRIAGE_COPY.notOperator, fields: [] };
  if (error.status === 412 || error.detail === DETAIL_STORY_CHANGED) return { message: TRIAGE_COPY.storyChanged, fields: [] };
  if (error.status === 409) {
    const message = error.detail === DETAIL_MERGE_CONFLICT ? TRIAGE_COPY.mergeConflict : TRIAGE_COPY.statusConflict;
    return { message, fields: [] };
  }
  if (error.status === 422) {
    // A string detail ("title: no links, HTML…") is the service refusing links / @names; a pydantic list
    // (too long, wrong type) only names the field.
    const refusedLink = error.detail !== null && error.fields.length > 0;
    return { message: refusedLink ? TRIAGE_COPY.noLinks : TRIAGE_COPY.invalidInput, fields: error.fields };
  }
  return { message: TRIAGE_COPY.saveFailed, fields: [] };
}
