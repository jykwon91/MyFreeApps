/** The board's "Me too" votes (`hooks/featureRequests/useMeToo.ts`). */
export interface MeTooState {
  isVoted: (storyId: string) => boolean;
  /** The vote is being saved — the button shows a spinner and ignores taps. */
  isPending: (storyId: string) => boolean;
  toggle: (storyId: string) => Promise<void>;
}
