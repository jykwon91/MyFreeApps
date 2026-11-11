import { plainDraftText } from "./plainDraftText";

/** Whether a draft line holds the text being refined, with or without its markdown marks. */
export function draftLineMatches(line: string, highlightText: string | null | undefined): boolean {
  if (!highlightText) return false;
  const needle = highlightText.trim();
  if (!needle) return false;
  return plainDraftText(line).includes(needle) || line.trim().includes(needle);
}
