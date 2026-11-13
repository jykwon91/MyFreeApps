/** A search as sent: trimmed and cut to the server's limit, or "" when too short to search. */
export function searchableText(text: string, minLength: number, maxLength: number): string {
  const query = text.trim().slice(0, maxLength).trim();
  return query.length >= minLength ? query : "";
}
