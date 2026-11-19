import type { ReactNode } from "react";
import type { ListLoadMode } from "@/shared/types/list-load-mode";

export interface DocumentsListBodyProps {
  mode: ListLoadMode;
  canWrite: boolean;
  children: ReactNode;
}
