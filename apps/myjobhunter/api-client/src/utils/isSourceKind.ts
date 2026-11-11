import { SOURCE_KIND_OPTIONS } from "../constants/sourceKinds";
import type { SourceKind } from "../types/discovery/source-kind";

/** True when a saved search's `source` is one of the shipped adapters. */
export function isSourceKind(source: string): source is SourceKind {
  return SOURCE_KIND_OPTIONS.some((option) => option.value === source);
}
