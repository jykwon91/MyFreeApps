function plainTableRow(cells: string): string {
  return cells.split("|").map((cell) => cell.trim()).filter(Boolean).join(" · ");
}

/**
 * Listing descriptions and welcome manuals are written in Markdown, which the phone has no renderer for, so the markers come off.
 * Each pattern stays on one line: a text can be long, and one that crosses lines gets slow.
 */
export function plainFromMarkdown(markdown: string): string {
  return markdown
    .replace(/^[ \t]*(?:```|~~~).*\n?/gm, "")
    .replace(/^(?=.*\|)(?=.*-)[ \t:|-]+\n?/gm, "")
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_row, cells: string) => plainTableRow(cells))
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
    .replace(/^[ \t]*(?:>[ \t]?)+/gm, "")
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/^([ \t]*)[-*+][ \t]+/gm, "$1• ")
    .replace(/!?\[([^[\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, "$1")
    .replace(/<((?:https?:\/\/|mailto:)[^<>\s]+)>/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[\s(])__([^_\n]+)__(?=[\s).,!?;:]|$)/gm, "$1$2")
    .replace(/(^|[\s(])[*_]([^\s*_](?:[^*_\n]*[^\s*_])?)[*_](?=[\s).,!?;:]|$)/gm, "$1$2");
}
