/** `path?qs`, or the bare path when there is no query. */
export function pathWithQuery(path: string, qs: string): string {
  return qs ? `${path}?${qs}` : path;
}
