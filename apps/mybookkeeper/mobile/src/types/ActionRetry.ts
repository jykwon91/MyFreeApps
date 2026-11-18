/**
 * Whether a server action whose answer was lost can just be sent again. "safe": doing it twice ends the same as once (cancel,
 * dismiss, disconnect, set a value). Otherwise `checkFirst` says where to look before retrying, like "Pull down to see whether
 * the sync started".
 */
export type ActionRetry = "safe" | { checkFirst: string };
