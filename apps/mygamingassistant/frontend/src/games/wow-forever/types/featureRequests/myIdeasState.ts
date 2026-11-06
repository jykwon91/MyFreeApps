import type { PendingIdea } from "@/games/wow-forever/types/featureRequests/pendingIdea";

/** Your own ideas (`hooks/featureRequests/useMyIdeas.ts`). */
export interface MyIdeasState {
  /** Still waiting for review — titles only, newest first. */
  pending: readonly PendingIdea[];
  /** Every story id you asked for, reviewed or not ("You asked" on the card). */
  mine: ReadonlySet<string>;
  add: (id: string, title: string) => void;
}
