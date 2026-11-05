/**
 * Listing descriptions are written in Markdown, which the phone has no renderer for, so the markers come off.
 * Each pattern stays on one line: a description can be long, and one that crosses lines gets slow.
 */
export function plainFromMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/!?\[([^[\]\n]+)\]\([^)\n]*\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[\s(])__([^_\n]+)__(?=[\s).,!?;:]|$)/gm, "$1$2")
    .replace(/(^|[\s(])[*_]([^\s*_](?:[^*_\n]*[^\s*_])?)[*_](?=[\s).,!?;:]|$)/gm, "$1$2");
}
