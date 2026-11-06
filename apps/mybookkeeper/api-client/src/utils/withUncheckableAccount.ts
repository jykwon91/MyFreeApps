/** `current` with `key` naming the account its earlier attempt went through, or no longer listed when `address` is null. */
export function withUncheckableAccount(
  current: ReadonlyMap<string, string>,
  key: string,
  address: string | null,
): ReadonlyMap<string, string> {
  if (address === null && !current.has(key)) return current;
  const next = new Map(current);
  if (address === null) next.delete(key);
  else next.set(key, address);
  return next;
}
