const PARENTHETICAL = /\([^)]*\)/g;
const MARKDOWN_CHARS = /[*_#`>~|[\]]/g;
const PICTOGRAPHS = /\p{Extended_Pictographic}/gu;
const WHITESPACE = /\s+/g;

/**
 * What the text-to-speech voice should say for a piece of tutor text.
 *
 * English glosses live in parentheses -- shown on screen, never spoken -- so
 * they are removed, along with any markdown or emoji the model slipped in.
 * Returns "" when nothing speakable is left.
 */
export function speakableText(text: string): string {
  return text
    .replace(PARENTHETICAL, " ")
    .replace(MARKDOWN_CHARS, " ")
    .replace(PICTOGRAPHS, " ")
    .replace(WHITESPACE, " ")
    .trim();
}
