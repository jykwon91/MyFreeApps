import { Fragment } from "react";
import { parseBoldSegments } from "../../utils/parseBoldSegments";

interface InlineBoldTextProps {
  /** A string with **bold** segments. Other markdown is rendered as
   *  plain text. */
  text: string;
  /** Optional className applied to the bold segments. */
  boldClassName?: string;
}

/**
 * Render a string with **markdown bold** segments inline. Tiny utility
 * for places that need bold-only formatting without pulling in a full
 * markdown library.
 *
 * Use cases: chip-summary previews, plain-text callouts, anywhere you
 * want bold emphasis on a substring without parsing block-level
 * markdown (headings, lists, links, etc.).
 *
 * Input strings are caller-controlled. XSS surface is limited to React's
 * text-node escaping, which handles HTML in the input automatically.
 */
export default function InlineBoldText({
  text,
  boldClassName = "text-foreground",
}: InlineBoldTextProps) {
  const segments = parseBoldSegments(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.bold ? (
          <strong key={i} className={boldClassName}>
            {seg.text}
          </strong>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}

