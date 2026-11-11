import type { SourceKind } from "@/types/discovery/source-kind";

const SOURCE_KINDS: readonly string[] = ["jsearch", "greenhouse", "lever"] satisfies readonly SourceKind[];

/** True when a saved search's `source` string is one of the shipped adapters. */
export function isSourceKind(source: string): source is SourceKind {
  return SOURCE_KINDS.includes(source);
}
