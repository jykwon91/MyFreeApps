/**
 * What the backend's request schemas accept, written out here rather than
 * imported from the api-client so a client that drifts from the server is
 * caught by the stub refusing it. Every schema is extra="forbid" and lists its
 * fields in the order pydantic validates them.
 */
import type { Level } from "@mylanguagetutor/api-client/types/tutor/level";
import type { FieldRule } from "../types/FieldRule";

/** TurnCreateRequest.text (app/schemas/tutor/turn_schemas.py). */
export const TURN_TEXT_MAX = 500;
/** ProfileUpdateRequest / SessionCreateRequest.language_code. */
export const LANGUAGE_CODE_MAX = 8;
/** SessionCreateRequest.scenario_slug. */
export const SCENARIO_SLUG_MAX = 40;
/** app/domain/levels.py, in definition order (pydantic's enum message lists them so). */
export const LEVELS: readonly Level[] = ["beginner", "some_phrases", "conversational"];

/** ProfileUpdateRequest (app/schemas/tutor/profile_schemas.py). */
export const PROFILE_FIELDS: readonly FieldRule[] = [
  { name: "language_code", kind: "string", maxLength: LANGUAGE_CODE_MAX },
  { name: "level", kind: "level" },
];
/** SessionCreateRequest (app/schemas/tutor/session_schemas.py). */
export const SESSION_FIELDS: readonly FieldRule[] = [
  { name: "language_code", kind: "string", maxLength: LANGUAGE_CODE_MAX },
  { name: "scenario_slug", kind: "string", maxLength: SCENARIO_SLUG_MAX },
  { name: "level", kind: "level" },
];
/** TurnCreateRequest, whose validator also refuses blank text. */
export const TURN_FIELDS: readonly FieldRule[] = [{ name: "text", kind: "string", maxLength: TURN_TEXT_MAX, notBlank: true }];
