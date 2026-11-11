import type { ResumePane } from "../types/ResumePane";

/** The phone shows the suggestion and the draft one at a time, where the website shows them side by side. */
export const RESUME_PANES: readonly { value: ResumePane; label: string }[] = [
  { value: "review", label: "Review" },
  { value: "draft", label: "Draft" },
];
