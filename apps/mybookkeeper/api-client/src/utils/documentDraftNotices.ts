/** What a read document's confidence means for the person checking the form it filled in. */
export const CONFIDENCE_NOTE: Record<string, string> = {
  high: "I read these straight off the document.",
  medium: "Some of these I had to interpret — worth a look before you save.",
  low: "I wasn't very sure about this one. Please check every field.",
};

/** The document's own paragraphs, kept as paragraphs. */
export function notesParagraphs(notes: string): string[] {
  return notes
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

/** What the folded reference section says about itself while it is still folded. */
export function referenceSummary(termCount: number, hasNotes: boolean): string {
  const plural = termCount === 1 ? "" : "s";
  const terms = `I noticed ${termCount} more term${plural} on the document`;
  if (termCount > 0 && hasNotes) return `${terms}, plus some notes I jotted down.`;
  if (termCount > 0) return `${terms}.`;
  return "I also jotted down some notes about this document.";
}
