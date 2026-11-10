import type { ReactNode } from "react";
import type { ViewOnlyStateProps } from "./ViewOnlyStateProps";

export interface RequireWriteProps extends ViewOnlyStateProps {
  /** The screen's own skeleton, shown while the role isn't known so no other skeleton follows it. */
  loading?: ReactNode;
  /** False lets everyone through; for gates that only some of their screens need guarded. */
  required?: boolean;
  children: ReactNode;
}
