/** Why a typed threshold can't be saved, or undefined when it can. Blank, non-numeric, negative and above-the-slider values are all refused. */
export function thresholdFieldError(value: string, max: number): string | undefined {
  const amount = value.trim();
  const number = amount === "" ? NaN : Number(amount);
  if (!Number.isFinite(number) || number < 0 || number > max) {
    return `Enter a number from 0 to ${max}.`;
  }
  return undefined;
}
