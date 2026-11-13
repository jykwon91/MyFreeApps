/** `text` with every RegExp metacharacter escaped, to match it literally inside a pattern. For E2E tests only. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
