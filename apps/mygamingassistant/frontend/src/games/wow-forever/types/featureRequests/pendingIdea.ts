/** An idea this browser sent that became a new story. Kept in localStorage. */
export interface PendingIdea {
  id: string;
  title: string;
  /** Seen on the public board — triage approved it; its card then says "You asked". */
  approved: boolean;
}
