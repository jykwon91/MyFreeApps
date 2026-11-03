/** The same wait on the same step is one timer, so a second tap can't start another. */
export function cookTimerId(stepId: string, seconds: number): string {
  return `${stepId}-${seconds}`;
}
