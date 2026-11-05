const PREVIEW_LINES = 2;
const PREVIEW_LENGTH = 120;

/** The first lines with words on them, so similar templates can be told apart in a list. */
export function replyTemplatePreview(body: string): string {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, PREVIEW_LINES)
    .join(" ");
  return lines.length > PREVIEW_LENGTH ? `${lines.slice(0, PREVIEW_LENGTH).trim()}...` : lines;
}
