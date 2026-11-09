/** True when every field of the two forms holds the same value. */
export function sameFormValues<Values extends object>(a: Values, b: Values): boolean {
  return (Object.keys(a) as (keyof Values)[]).every((field) => a[field] === b[field]);
}
