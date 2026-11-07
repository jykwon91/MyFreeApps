/** Whitespace of any kind (tabs and line breaks too) — becomes one space. */
const WHITESPACE = /\s+/gu;
/** Control and format characters (zero-width, bidi overrides, soft hyphen, tag characters…): never kept in text a player typed or a link carried. */
const HIDDEN = /[\p{Cc}\p{Cf}]/gu;

/** One line of player text as stored and shown: spaces collapsed, hidden characters dropped, at most `maxLength` characters ("" when nothing is left). */
export function cleanUserText(raw: string, maxLength: number): string {
  const visible = raw.replace(WHITESPACE, " ").replace(HIDDEN, "").replace(WHITESPACE, " ").trim();
  return Array.from(visible).slice(0, maxLength).join("").trim();
}
