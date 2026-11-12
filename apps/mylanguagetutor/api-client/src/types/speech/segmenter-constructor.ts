import type { SentenceSegmenter } from "./sentence-segmenter";

/** ``Intl.Segmenter``'s constructor, which not every runtime ships. */
export type SegmenterConstructor = new (
  locale: string,
  options: { granularity: "sentence" },
) => SentenceSegmenter;
