/** The item in `after` that wasn't in `before` and `matches`: what an add made, once the list is read again. */
export function newlyCreated<T extends { id: string }>(before: readonly T[], after: readonly T[], matches: (item: T) => boolean): T | undefined {
  return after.find((item) => matches(item) && !before.some((old) => old.id === item.id));
}
