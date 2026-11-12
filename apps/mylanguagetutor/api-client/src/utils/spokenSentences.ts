import { createSentenceChunker } from "./sentenceChunker";

/** A whole reply split into the sentences it is spoken in, as a streamed reply is. */
export function spokenSentences(text: string, locale: string): string[] {
  const chunker = createSentenceChunker(locale);
  return [...chunker.push(text), ...chunker.flush()];
}
