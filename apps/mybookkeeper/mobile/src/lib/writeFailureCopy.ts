import type { WriteFailureCopy } from "../types/WriteFailureCopy";

/** `noun` and `plural` read in a sentence, like "vendor" and "vendors". Fixed wording only: the server's own text is never shown. */
export function saveFailureCopy(noun: string, plural: string, isNew: boolean): WriteFailureCopy {
  // A lost answer or a proxy error can come after the server saved, so a retry could make two.
  const unsure = `I'm not sure that saved. Check your ${plural} before trying again, so you don't end up with two.`;
  const tryAgain = "I couldn't save that. Want to try again?";
  return {
    noResponse: isNew ? unsure : `I can't reach the server, so I couldn't save that. Your changes are still here.`,
    viewOnly: "You have view-only access, so I can't save this.",
    gone: `I can't find that ${noun} anymore. It may have been deleted.`,
    conflict: `That clashes with a ${noun} you already have. Check the name and try again.`,
    invalid: "Something in there isn't right. Check the fields and try again.",
    serverError: isNew ? unsure : tryAgain,
    other: tryAgain,
  };
}

export function deleteFailureCopy(noun: string): WriteFailureCopy {
  const tryAgain = `I couldn't delete that ${noun}. Want to try again?`;
  return {
    noResponse: `I can't reach the server, so I couldn't delete that ${noun}.`,
    viewOnly: "You have view-only access, so I can't delete this.",
    gone: `That ${noun} was already deleted.`,
    conflict: `Something still depends on that ${noun}, so I couldn't delete it.`,
    invalid: tryAgain,
    serverError: tryAgain,
    other: tryAgain,
  };
}
