import type { FieldChange } from "./field-change";

/** A per-version field the diff compares (backend app/core/version_diff_fields.py). */
export type VersionDiffField = FieldChange["field"];
