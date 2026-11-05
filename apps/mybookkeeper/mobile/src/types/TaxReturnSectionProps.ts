import type { ReactNode } from "react";

export interface TaxReturnSectionProps {
  title: string;
  loading: boolean;
  /** Failed with nothing to show. Must not read as an empty section. */
  failed: boolean;
  /** Shown once loaded when there's nothing in it. Null otherwise. */
  emptyMessage: string | null;
  children?: ReactNode;
}
