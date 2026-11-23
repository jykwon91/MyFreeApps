/**
 * The boxes the practice screen (PracticeSession) and its loading skeleton
 * (PracticeSkeleton) share, so the skeleton fills the same space as the page it
 * stands in for. Each text line's placeholder bar is that line's height:
 * text-xl -> h-7, text-sm -> h-5, text-xs -> h-4.
 */
export const PRACTICE_PAGE = "flex min-h-[60vh] flex-col gap-4";
export const PRACTICE_HEADER = "space-y-2";
export const PRACTICE_TRANSCRIPT = "flex-1";
/** The empty transcript's "say hello to start" line. */
export const PRACTICE_START_PROMPT = "py-8 text-center text-sm text-muted-foreground";
export const PRACTICE_COMPOSER = "sticky bottom-0 space-y-3 border-t bg-background py-4";

/** Test ids on the three sections, shared by the page and its skeleton so a test can compare them. */
export const PRACTICE_SECTION_IDS = {
  header: "practice-header",
  transcript: "practice-transcript",
  composer: "practice-composer",
} as const;
