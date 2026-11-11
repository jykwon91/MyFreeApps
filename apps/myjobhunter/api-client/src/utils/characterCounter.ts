import { CHARACTER_COUNTER_THRESHOLD } from "../constants/characterCounterThreshold";
import { textLength } from "./textLength";

/**
 * "5,100 / 5,000": how much of the limit a value uses, for showing next to the field, or undefined
 * while it is well within it. It is only for the eye: it changes with every keystroke, so it must
 * never be announced as an alert.
 */
export function characterCounter(value: string, max: number): string | undefined {
  const length = textLength(value);
  if (length < max * CHARACTER_COUNTER_THRESHOLD) return undefined;
  return `${length.toLocaleString("en-US")} / ${max.toLocaleString("en-US")}`;
}
