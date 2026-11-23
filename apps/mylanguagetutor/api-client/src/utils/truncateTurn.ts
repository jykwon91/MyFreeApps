import type { TruncatedTurn } from "../types/session/truncated-turn";

// A sentence ends at ., !, ? or an ellipsis (closing quotes or brackets may follow), then a space or the end.
// East Asian full stops need no space after them.
const SENTENCE_END = /(?:[.!?…]+["'”’)\]»]*(?=\s|$))|(?:[。！？]+["'”’)\]»」』）]*)/g;

/** Where the last sentence within ``limit`` ends, or null when none does. */
function lastSentenceEnd(text: string, limit: number): number | null {
  let end: number | null = null;
  for (const match of text.slice(0, limit + 1).matchAll(SENTENCE_END)) {
    const stop = match.index + match[0].length;
    if (stop <= limit) end = stop;
  }
  return end;
}

/** Fits ``text`` to ``limit`` characters, cutting at the last sentence end, else the last word end, else the limit. */
export function truncateTurn(text: string, limit: number): TruncatedTurn {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return { text: trimmed, truncated: false };
  const sentenceEnd = lastSentenceEnd(trimmed, limit);
  if (sentenceEnd) return { text: trimmed.slice(0, sentenceEnd).trimEnd(), truncated: true };
  const fits = trimmed.slice(0, limit);
  const wordEnd = /\s/.test(trimmed[limit]) ? limit : fits.search(/\s+\S*$/);
  return { text: (wordEnd > 0 ? trimmed.slice(0, wordEnd) : fits).trimEnd(), truncated: true };
}
