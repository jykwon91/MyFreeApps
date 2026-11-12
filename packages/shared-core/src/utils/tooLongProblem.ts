import { textLength } from "./textLength";

/**
 * The "too long" message for a value over `max` characters, counted in code points as the backend
 * counts them, or undefined when it fits. The message is the same for every over-limit value, so a
 * screen reader announces it once, when the field crosses the limit, not on each keystroke after;
 * the changing count is `characterCounter`'s job.
 */
export function tooLongProblem(value: string, max: number): string | undefined {
  return textLength(value) > max ? `Keep this to ${max.toLocaleString("en-US")} characters or fewer.` : undefined;
}
