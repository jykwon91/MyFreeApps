/**
 * Checks request bodies the way the backend's pydantic schemas do and builds
 * FastAPI's 422 answer: every problem, with pydantic's own error types and
 * messages (verified against pydantic 2 for these schemas).
 */
import { LEVELS } from "../constants/backendLimits";
import type { FieldRule } from "../types/FieldRule";
import type { RequestBody } from "../types/RequestBody";
import type { ValidationErrorBody } from "../types/ValidationErrorBody";
import type { ValidationIssue } from "../types/ValidationIssue";

const MIN_LENGTH = 1;
/** Pydantic's enum message: "'a', 'b' or 'c'". */
const LEVEL_CHOICES = `${LEVELS.slice(0, -1).map((level) => `'${level}'`).join(", ")} or '${LEVELS[LEVELS.length - 1]}'`;

function fieldIssue(rule: FieldRule, body: RequestBody): ValidationIssue | null {
  const loc = ["body", rule.name];
  if (!(rule.name in body)) return { type: "missing", loc, msg: "Field required", input: body };
  const input = body[rule.name];
  if (rule.kind === "level") {
    if (typeof input === "string" && (LEVELS as readonly string[]).includes(input)) return null;
    return { type: "enum", loc, msg: `Input should be ${LEVEL_CHOICES}`, input, ctx: { expected: LEVEL_CHOICES } };
  }
  if (typeof input !== "string") return { type: "string_type", loc, msg: "Input should be a valid string", input };
  if (input.length < MIN_LENGTH) {
    return { type: "string_too_short", loc, msg: "String should have at least 1 character", input, ctx: { min_length: MIN_LENGTH } };
  }
  if (input.length > rule.maxLength) {
    return { type: "string_too_long", loc, msg: `String should have at most ${rule.maxLength} characters`, input, ctx: { max_length: rule.maxLength } };
  }
  if (rule.notBlank && input.trim() === "") {
    return { type: "value_error", loc, msg: `Value error, ${rule.name} must not be blank`, input, ctx: { error: {} } };
  }
  return null;
}

/** FastAPI's 422 body for `body` against the schema, or null when the schema accepts it. */
export function validationError(body: unknown, rules: readonly FieldRule[]): ValidationErrorBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { detail: [{ type: "model_attributes_type", loc: ["body"], msg: "Input should be a valid dictionary or object to extract fields from", input: body }] };
  }
  const fields = body as RequestBody;
  const issues = rules.map((rule) => fieldIssue(rule, fields)).filter((issue): issue is ValidationIssue => issue !== null);
  const allowed = new Set(rules.map((rule) => rule.name));
  for (const [name, input] of Object.entries(fields)) {
    if (!allowed.has(name)) issues.push({ type: "extra_forbidden", loc: ["body", name], msg: "Extra inputs are not permitted", input });
  }
  return issues.length > 0 ? { detail: issues } : null;
}
