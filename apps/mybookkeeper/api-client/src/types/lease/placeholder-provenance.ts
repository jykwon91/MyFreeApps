/**
 * Where a placeholder value came from during auto-fill.
 *
 * - ``"applicant"`` — resolved from the applicant row
 * - ``"inquiry"`` — resolved from the linked inquiry (fallback)
 * - ``"today"`` — resolved from today's date
 * - ``"manual"`` — host typed or edited the value
 * - ``null`` — field has no default_source; manual-entry only
 */
export type PlaceholderProvenance =
  | "applicant"
  | "inquiry"
  | "today"
  | "manual"
  | null;
