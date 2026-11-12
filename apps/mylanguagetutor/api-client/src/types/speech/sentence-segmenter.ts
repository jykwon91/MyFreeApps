import type { SentenceSegment } from "./sentence-segment";

/** The subset of ``Intl.Segmenter`` the sentence chunker uses. */
export interface SentenceSegmenter {
  segment(input: string): Iterable<SentenceSegment>;
}
