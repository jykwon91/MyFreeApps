import type { ReactNode } from "react";

export interface FormSheetProps {
  title: string;
  isOpen: boolean;
  /** Back, or the system's dismiss. The sheet doesn't decide whether leaving is safe. */
  onRequestClose: () => void;
  /** What went wrong, shown at the top where the person will see it. */
  failure?: string | null;
  children: ReactNode;
}
