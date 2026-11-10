export const AI_SUGGESTION_MESSAGES = {
  none: "I had a look but didn't find any placeholders.",
  hide: "Hide suggestions",
  show: "Show suggestions",
  dismiss: "Dismiss suggestions",
  notInSpec: "Not found by the bracket detector",
  review: "Review the placeholders below and edit them as needed.",
} as const;

export function suggestionsHeadline(count: number, matched: number): string {
  const found = `Got it, I think I found ${count} placeholder${count === 1 ? "" : "s"}.`;
  return matched > 0 ? `${found} ${matched} already matched by the bracket detector.` : found;
}
