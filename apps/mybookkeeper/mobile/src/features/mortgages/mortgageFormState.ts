import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";

export function sameFormValues(a: MortgageFormValues, b: MortgageFormValues): boolean {
  return (Object.keys(a) as (keyof MortgageFormValues)[]).every((field) => a[field] === b[field]);
}
