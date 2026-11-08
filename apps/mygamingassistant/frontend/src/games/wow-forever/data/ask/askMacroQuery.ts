/** Words in a macro search that say nothing about what the macro does ("best warlock macros"). */
export const MACRO_QUERY_IGNORED: ReadonlySet<string> = new Set([
  "macro",
  "macros",
  "best",
  "good",
  "useful",
  "some",
  "any",
  "for",
  "the",
  "and",
  "with",
  "my",
  "class",
]);

/** Shorter words are skipped too ("a", "to"). */
export const MACRO_QUERY_MIN_WORD = 3;
