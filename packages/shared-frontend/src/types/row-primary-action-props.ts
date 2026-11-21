import type { ReactNode } from "react";

/**
 * A row that navigates passes `to` (rendered as a link); a row that opens a
 * panel or dialog passes `onActivate` (rendered as a button).
 */
export type RowPrimaryActionProps = {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
} & ({ to: string } | { onActivate: () => void });
