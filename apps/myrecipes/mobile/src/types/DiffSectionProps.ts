import type { DiffLine } from "./DiffLine";

export interface DiffSectionProps {
  title: string;
  emptyText: string;
  lines: DiffLine[];
}
