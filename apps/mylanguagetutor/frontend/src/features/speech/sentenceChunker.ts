/**
 * Splits streamed text into whole sentences as they complete, so each one can
 * be spoken while the rest of the reply is still arriving.
 *
 * Uses ``Intl.Segmenter`` (sentence granularity, locale-aware -- handles
 * Spanish "¿...?" / "¡...!") when the browser has it, with a punctuation
 * fallback otherwise. The last segment of the buffer is held back until more
 * text arrives or ``flush`` is called, because it may be mid-sentence.
 */

interface SentenceSegment {
  segment: string;
}

interface SentenceSegmenter {
  segment(input: string): Iterable<SentenceSegment>;
}

type SegmenterConstructor = new (
  locale: string,
  options: { granularity: "sentence" },
) => SentenceSegmenter;

const FALLBACK_BOUNDARY = /(?<=[.!?…])\s+/;

function segmenterFor(locale: string): SentenceSegmenter | null {
  const ctor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (!ctor) return null;
  try {
    return new ctor(locale, { granularity: "sentence" });
  } catch {
    return null;
  }
}

export function splitSentences(text: string, segmenter: SentenceSegmenter | null): string[] {
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  const parts = text.split(FALLBACK_BOUNDARY);
  // Re-attach the whitespace the split consumed so the tail stays intact.
  return parts.map((part, i) => (i < parts.length - 1 ? `${part} ` : part));
}

export interface SentenceChunker {
  /** Add streamed text; returns any sentences that are now complete. */
  push(text: string): string[];
  /** The stream ended: return whatever is left as the final sentence. */
  flush(): string[];
}

export function createSentenceChunker(
  locale: string,
  segmenter: SentenceSegmenter | null = segmenterFor(locale),
): SentenceChunker {
  let buffer = "";
  return {
    push(text: string): string[] {
      buffer += text;
      const segments = splitSentences(buffer, segmenter);
      if (segments.length <= 1) return [];
      const last = segments[segments.length - 1];
      buffer = last;
      return segments
        .slice(0, -1)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    },
    flush(): string[] {
      const rest = buffer.trim();
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}
