/**
 * How long the backend counts this text: in code points, as Pydantic's `max_length` and Postgres
 * `varchar(n)` do. `.length` counts UTF-16 units, so an emoji would count twice.
 */
export function textLength(value: string): number {
  return [...value].length;
}
