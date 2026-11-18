/**
 * What asking the server again says about an add whose answer was lost (see writeOutcome): it was made
 * after all (`item` is what it made), it wasn't (so trying again is safe), the server couldn't be asked,
 * or a cache reset (sign-out, account change) called the check off.
 */
export type LostCreateCheck<T> = { kind: "created"; item: T } | { kind: "notCreated" } | { kind: "unknown" } | { kind: "cancelled" };
