import type { DiffLine } from "./DiffLine";

export interface DiffSectionProps {
  title: string;
  /** Said when there are no changes; omitted for a section shown only when it has some. */
  emptyText?: string;
  lines: DiffLine[];
}
