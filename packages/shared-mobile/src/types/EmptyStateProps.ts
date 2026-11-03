import type { ReactNode } from "react";
import type { EmptyStateAction } from "./EmptyStateAction";

export interface EmptyStateProps {
  heading: string;
  body: string;
  icon?: ReactNode;
  action?: EmptyStateAction;
}
