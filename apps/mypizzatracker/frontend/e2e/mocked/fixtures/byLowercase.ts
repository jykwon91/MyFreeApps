/** Orders strings like Python's `sorted(names, key=str.lower)`: by their lowercased code points. */
export function byLowercase(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
