import type { DraftLine } from "@myjobhunter/api-client/types/resume-refinement/draft-line";

/** One row of the phone's draft: a heading, a paragraph or a bullet, in the draft's order. */
export interface DraftRow {
  key: string;
  kind: "heading1" | "heading2" | "heading3" | "paragraph" | "bullet";
  line: DraftLine;
}
