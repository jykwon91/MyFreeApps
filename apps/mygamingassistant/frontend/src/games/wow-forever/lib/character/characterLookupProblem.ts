/** What the character page says when Blizzard can't give the character. */
import { statusOf } from "@/games/wow-forever/lib/raidPageError";

export const CHARACTER_NOT_FOUND_MESSAGE =
  "Blizzard has no character by that name. Check the spelling of both names. If you made the character today, log out to character select, wait a few minutes and try again.";
export const CHARACTER_BAD_NAME_MESSAGE = "Type the character's first name and surname, like \"Jason Kwon\".";
export const CHARACTER_RATE_LIMITED_MESSAGE = "Too many lookups — try again in a minute.";
export const CHARACTER_UPSTREAM_MESSAGE = "Blizzard's character service didn't answer. Try again in a moment.";
export const CHARACTER_NO_RESPONSE_MESSAGE = "Couldn't reach the server — check your connection and try again.";

const MESSAGES_BY_STATUS: ReadonlyMap<number, string> = new Map([
  [400, CHARACTER_BAD_NAME_MESSAGE],
  [404, CHARACTER_NOT_FOUND_MESSAGE],
  [429, CHARACTER_RATE_LIMITED_MESSAGE],
]);

/** A failed lookup (RTK Query's `{ status, data }`) in words. */
export function characterLookupProblem(error: unknown): string {
  const status = statusOf(error);
  if (status === undefined) return CHARACTER_NO_RESPONSE_MESSAGE;
  return MESSAGES_BY_STATUS.get(status) ?? CHARACTER_UPSTREAM_MESSAGE;
}
