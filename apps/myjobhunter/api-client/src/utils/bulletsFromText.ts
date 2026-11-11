/** One bullet per non-blank line, trimmed. */
export function bulletsFromText(text: string): string[] {
  return text
    .split("\n")
    .map((bullet) => bullet.trim())
    .filter(Boolean);
}
