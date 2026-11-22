import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import type { DiscardCopy } from "@platform/core/types/discard/discard-copy";
import type { DraftOrigin } from "../types/recipe/draft-origin";

/**
 * Whether leaving an untouched draft loses nothing: a discovered recipe can be opened again from
 * its page, but a photo's read can't be rebuilt without picking the photo and waiting for another read.
 */
export const DRAFT_CAN_BE_REBUILT: Record<DraftOrigin, boolean> = {
  discover: true,
  photo: false,
};

/** What's asked before a draft is left: a photo's says it would need reading again. */
export const DRAFT_DISCARD_COPY: Record<DraftOrigin, DiscardCopy> = {
  discover: DISCARD_MESSAGES,
  photo: {
    discardTitle: "Leave without creating this recipe?",
    discardBody: "I'd have to read your photo again if you want it back.",
    keepEditing: "Stay here",
    discard: "Leave",
  },
};

/** What's asked before a photo's draft is thrown away to pick another photo. */
export const CHOOSE_AGAIN_DISCARD_COPY: DiscardCopy = {
  discardTitle: "Choose a different photo?",
  discardBody: "This recipe won't be created, and I'd have to read the new photo.",
  keepEditing: "Stay here",
  discard: "Choose another",
};
