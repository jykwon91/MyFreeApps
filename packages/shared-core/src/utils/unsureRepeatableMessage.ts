/**
 * For a write that's safe to send twice (a delete, or setting a value) whose outcome is unknown (see writeOutcome): it may
 * have gone through, so it mustn't be called a failure, but sending it again does no harm. `what` reads after "I'm not sure",
 * like "that vendor was deleted".
 */
export function unsureRepeatableMessage(what: string): string {
  return `I didn't get an answer, so I'm not sure ${what}. Trying again is safe.`;
}
