import { BENCHMARK_FORM_PROBLEMS } from "../constants/benchmarkForm";

const NUMBER = /^(\d+(\.\d*)?|\.\d+)$/;

/** A plain non-negative decimal: no sign, no exponent, no stray text. */
export function isPlainNumber(text: string): boolean {
  return NUMBER.test(text.trim());
}

export function decimalPlaces(text: string): number {
  return text.trim().split(".")[1]?.length ?? 0;
}

/** Text is sent trimmed, so the limit applies to what the server will see. */
export function isTooLong(text: string, max: number): boolean {
  return text.trim().length > max;
}

/** A date is required and may not be after the caller's today (ISO yyyy-MM-dd compares as text). */
export function observedOnProblem(observedOn: string, today: string): string | undefined {
  if (observedOn === "") return BENCHMARK_FORM_PROBLEMS.dateRequired;
  return observedOn > today ? BENCHMARK_FORM_PROBLEMS.dateInFuture : undefined;
}
