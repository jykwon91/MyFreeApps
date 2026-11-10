/** The interviewers typed one per line, trimmed, blank lines dropped. */
export function parseInterviewerNames(text: string): string[] {
  return text
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}
