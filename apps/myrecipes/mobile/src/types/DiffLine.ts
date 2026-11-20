import type { DiffChangeKind } from "@myrecipes/api-client/types/recipe/diff";

/** One change in a diff, as text on each side. `before` is null for an addition, `after` for a removal. */
export interface DiffLine {
  key: string;
  change: DiffChangeKind;
  /** What the line is about, shown before it ("Cook time"); omitted for ingredient and step lines. */
  label?: string;
  before: string | null;
  after: string | null;
}
