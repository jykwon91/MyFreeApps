import { DEMO_WORKSPACE_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import { WRITE_RATE_LIMITED_MESSAGE, WRITE_TOO_LARGE_MESSAGE } from "@mybookkeeper/api-client/constants/writeFailureMessages";
import { unsureRepeatableMessage } from "@platform/core/utils/unsureRepeatableMessage";
import type { ActionRetry } from "../types/ActionRetry";
import type { WriteFailureCopy } from "../types/WriteFailureCopy";

/*
 * "noResponse" and "serverError" are the failures after which the write may still have gone through (see writeFailure), so
 * none of these call them a failure. A create could make two, so it says where to check; a change or a delete is safe to send
 * again (a delete that already went answers "already deleted"), so it says so.
 */

/**
 * For a create whose outcome is unknown (see writeOutcome): a lost answer or a proxy error can come after the server saved,
 * so a retry could make two. `plural` reads after "Check your", like "vendors".
 */
export function unsureSavedMessage(plural: string): string {
  return `I'm not sure that saved. Check your ${plural} before trying again, so you don't end up with two.`;
}

/** `noun` and `plural` read in a sentence, like "vendor" and "vendors". Fixed wording only: the server's own text is never shown. */
export function saveFailureCopy(noun: string, plural: string, isNew: boolean): WriteFailureCopy {
  const unsure = isNew ? unsureSavedMessage(plural) : unsureRepeatableMessage("that saved");
  const tryAgain = "I couldn't save that. Want to try again?";
  return {
    noResponse: unsure,
    viewOnly: "You have view-only access, so I can't save this.",
    demo: DEMO_WORKSPACE_REFUSED,
    gone: `I can't find that ${noun} anymore. It may have been deleted.`,
    conflict: `That clashes with a ${noun} you already have. Check the name and try again.`,
    invalid: "Something in there isn't right. Check the fields and try again.",
    serverError: unsure,
    other: tryAgain,
    rateLimited: WRITE_RATE_LIMITED_MESSAGE,
    tooLarge: WRITE_TOO_LARGE_MESSAGE,
  };
}

export function deleteFailureCopy(noun: string): WriteFailureCopy {
  const tryAgain = `I couldn't delete that ${noun}. Want to try again?`;
  const unsure = unsureRepeatableMessage(`that ${noun} was deleted`);
  return {
    noResponse: unsure,
    viewOnly: "You have view-only access, so I can't delete this.",
    demo: DEMO_WORKSPACE_REFUSED,
    gone: `That ${noun} was already deleted.`,
    conflict: `Something still depends on that ${noun}, so I couldn't delete it.`,
    invalid: tryAgain,
    serverError: unsure,
    other: tryAgain,
    rateLimited: WRITE_RATE_LIMITED_MESSAGE,
    tooLarge: WRITE_TOO_LARGE_MESSAGE,
  };
}

/** For a button that does something on the server. `doing` reads after "couldn't", like "start the sync". */
export function actionFailureCopy(doing: string, retry: ActionRetry, overrides: Partial<WriteFailureCopy> = {}): WriteFailureCopy {
  const tryAgain = `I couldn't ${doing}. Want to try again?`;
  const what = `I managed to ${doing}`;
  const unsure =
    retry === "safe" ? unsureRepeatableMessage(what) : `I didn't get an answer, so I'm not sure ${what}. ${retry.checkFirst} before trying again.`;
  return {
    noResponse: unsure,
    viewOnly: "You have view-only access, so I can't do that.",
    demo: DEMO_WORKSPACE_REFUSED,
    gone: `I couldn't ${doing} because it's no longer there. Pull down to refresh.`,
    conflict: `I couldn't ${doing} because it's already in progress. Pull down to refresh.`,
    invalid: tryAgain,
    serverError: unsure,
    other: tryAgain,
    rateLimited: WRITE_RATE_LIMITED_MESSAGE,
    tooLarge: WRITE_TOO_LARGE_MESSAGE,
    ...overrides,
  };
}
