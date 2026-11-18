import { unsureRepeatableMessage } from "@platform/core/utils/unsureRepeatableMessage";

/** For a removal whose answer was lost (see writeOutcome): it may have gone through, and removing again answers "already gone". */
export const REMOVAL_UNSURE_MESSAGE = unsureRepeatableMessage("that was removed");
