/** Repeats a key for a list, which is how the backend's list query parameters read them. */
export function queryString(params: Record<string, string | readonly string[] | null | undefined>): string {
  return Object.entries(params)
    .flatMap(([key, value]) => (value ? [value].flat().map((item) => `${key}=${encodeURIComponent(item)}`) : []))
    .join("&");
}
