import type { DuplicateVerdictResponse } from "@/games/wow-forever/types/featureRequests/duplicateVerdictResponse";
import type { NewVerdictResponse } from "@/games/wow-forever/types/featureRequests/newVerdictResponse";
import type { SubmitFailure } from "@/games/wow-forever/types/featureRequests/submitFailure";

/** What the form card shows, discriminated on `view`. */
export type SuggestionView =
  | {
      view: "compose";
      /** Why the last send didn't produce a story (rejected, paused, offline...), or null. */
      failure: SubmitFailure | null;
      /** Back from "That's not what I meant": show "Add what I got wrong". */
      correcting: boolean;
    }
  | { view: "clarify"; submissionId: string; question: string; failure: SubmitFailure | null }
  | { view: "new"; response: NewVerdictResponse }
  | { view: "duplicate"; response: DuplicateVerdictResponse };
