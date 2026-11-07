import { DUPLICATE_PREFIX, MAX_BIS_LIST_NAME_LENGTH, UNNAMED_BIS_LIST } from "@/games/wow-forever/data/bisLists/bisListConfig";

/** Control, zero-width and bidi-override characters: never kept in a name (a shared name is untrusted). */
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

/** A list name as stored and shown: hidden characters dropped, spaces collapsed, at most the max length. */
export function cleanBisListName(raw: string, fallback: string = UNNAMED_BIS_LIST): string {
  const visible = Array.from(raw)
    .filter((ch) => !isHidden(ch.codePointAt(0) ?? 0))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const name = Array.from(visible).slice(0, MAX_BIS_LIST_NAME_LENGTH).join("").trim();
  return name || fallback;
}

/** "Copy of <name>", cut to the max length. */
export function duplicateBisListName(name: string): string {
  return cleanBisListName(`${DUPLICATE_PREFIX}${name}`);
}
