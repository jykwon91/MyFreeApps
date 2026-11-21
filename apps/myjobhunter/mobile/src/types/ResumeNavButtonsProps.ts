import type { NavDirection } from "@myjobhunter/api-client/types/resume-refinement/nav-direction";

export interface ResumeNavButtonsProps {
  /** Zero-based. */
  targetIndex: number;
  totalTargets: number;
  /** Another action on the session, or a move, is on its way. */
  isPending: boolean;
  onMove: (direction: NavDirection) => void;
}
