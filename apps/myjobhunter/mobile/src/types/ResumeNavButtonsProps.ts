export interface ResumeNavButtonsProps {
  sessionId: string;
  /** Zero-based. */
  targetIndex: number;
  totalTargets: number;
  /** Another action on the session is on its way. */
  isPending: boolean;
}
