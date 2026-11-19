import type { SectionErrorProps } from "@platform/mobile";
import type { ReactNode } from "react";
import type { TransactionChoice } from "./TransactionChoice";

/** One of the transaction form's option sheets: what it offers, what's picked, and how a pick is kept. */
export interface TransactionSheetConfig {
  options: TransactionChoice[];
  value: string;
  apply: (value: string) => void;
  description?: string;
  /** Shown while the options are still loading. */
  emptyText?: string;
  /** Shown in place of the options when they failed to load. */
  loadError?: SectionErrorProps;
  /** Under a long list: the next page loading, or its retry. */
  footer?: ReactNode;
  /** Asks for the next page of a long list. */
  onEndReached?: () => void;
}
