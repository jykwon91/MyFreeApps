/** Learner-profile, session, usage and correction responses in the backend's shapes. */
import type { CorrectionItem } from "@mylanguagetutor/api-client/types/tutor/correction-item";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { SessionCreate } from "@mylanguagetutor/api-client/types/tutor/session-create";
import type { TutorSession } from "@mylanguagetutor/api-client/types/tutor/tutor-session";
import type { UsageToday } from "@mylanguagetutor/api-client/types/tutor/usage-today";
import { NOW } from "../constants/fixtureTimes";

/** ProfileResponse (app/schemas/tutor/profile_schemas.py). */
export function profileOf(overrides: Partial<Profile> = {}): Profile {
  return { language_code: "es", level: "beginner", updated_at: NOW, ...overrides };
}

/** SessionSummary as POST /sessions answers it: active, no turns yet. */
export function sessionOf(id: string, request: SessionCreate): TutorSession {
  return {
    id,
    language_code: request.language_code,
    scenario_slug: request.scenario_slug,
    level: request.level,
    status: "active",
    turn_count: 0,
    created_at: NOW,
    updated_at: NOW,
    ended_at: null,
  };
}

/** UsageTodayResponse: most of today's budget left, the tutor on. */
export const PLENTY_LEFT: UsageToday = { remaining_fraction: 0.9, cap_reached: false, tutor_available: true };
/** Today's budget can't cover another turn. */
export const CAP_REACHED: UsageToday = { remaining_fraction: 0, cap_reached: true, tutor_available: true };
/** The kill switch or the global cap: the tutor is off for everyone, though this learner has budget left. */
export const TUTOR_OFF: UsageToday = { remaining_fraction: 0.9, cap_reached: false, tutor_available: false };

/** One CorrectionItem (app/schemas/tutor/turn_schemas.py). */
export function correctionOf(overrides: Partial<CorrectionItem> = {}): CorrectionItem {
  return {
    error_span: "soy llamo",
    corrected_span: "me llamo",
    full_corrected_sentence: "Me llamo Sam.",
    error_type: "verb_form",
    severity: "noticeable",
    feedback_move: "recast",
    explanation: "Use \"me llamo\" to say your name.",
    ...overrides,
  };
}
