/**
 * How long the backend counts this text: in code points, as Pydantic's `max_length` and Postgres
 * `varchar(n)` do. `.length` counts UTF-16 units, so an emoji would count twice. Counted in a loop
 * rather than by spreading into an array, which copies a pasted 50,000-character text on every keystroke.
 */
export function textLength(value: string): number {
  let count = 0;
  for (const _codePoint of value) count += 1;
  return count;
}
