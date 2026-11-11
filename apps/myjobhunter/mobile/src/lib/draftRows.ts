import type { DraftBlock } from "@myjobhunter/api-client/types/resume-refinement/draft-block";
import type { DraftRow } from "../types/DraftRow";

/** The draft's blocks as one list of rows, so each row's place in the draft is known for scrolling to it. */
export function draftRows(blocks: readonly DraftBlock[]): DraftRow[] {
  return blocks.flatMap((block, index): DraftRow[] => {
    if (block.kind === "list") return block.items.map((line, item) => ({ key: `${index}-${item}`, kind: "bullet", line }));
    if (block.kind === "heading") return [{ key: `${index}`, kind: `heading${block.level}`, line: block.line }];
    return [{ key: `${index}`, kind: "paragraph", line: block.line }];
  });
}
