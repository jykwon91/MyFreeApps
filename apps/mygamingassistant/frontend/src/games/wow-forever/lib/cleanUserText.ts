/** Control, zero-width and bidi-override characters: never kept in text a player typed or a link carried (it's untrusted). */
function isHidden(codePoint: number): boolean {
  return (
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

/** One line of player text as stored and shown: hidden characters dropped, spaces collapsed, at most `maxLength` characters ("" when nothing is left). */
export function cleanUserText(raw: string, maxLength: number): string {
  const visible = Array.from(raw)
    .filter((ch) => !isHidden(ch.codePointAt(0) ?? 0))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(visible).slice(0, maxLength).join("").trim();
}
