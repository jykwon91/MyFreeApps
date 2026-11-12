/** Turns streamed text into whole sentences as they complete. */
export interface SentenceChunker {
  /** Add streamed text; returns any sentences that are now complete. */
  push(text: string): string[];
  /** The stream ended: return whatever is left as the final sentence. */
  flush(): string[];
}
