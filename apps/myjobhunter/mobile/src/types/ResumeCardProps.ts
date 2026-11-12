import type { ChipTone } from "@platform/mobile";
import type { ReactNode } from "react";

export interface ResumeCardProps {
  children: ReactNode;
  /** Tints the border, as the website does for a failed preparation or a finished session. */
  tone?: ChipTone;
  testID?: string;
}
