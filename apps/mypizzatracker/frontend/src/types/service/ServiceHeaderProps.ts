import type { ReactNode } from "react";

export interface ServiceHeaderProps {
  /** The heading (and status badge), or a placeholder for it. */
  title: ReactNode;
  /** The line under the title, or a placeholder for it. */
  subtitle?: ReactNode;
  /** Controls to the right of the title, such as the drop picker. */
  actions?: ReactNode;
}
