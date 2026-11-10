/** Cards a section's skeleton shows while its list loads. */
export const SECTION_SKELETON_CARDS = ["a", "b"] as const;

/** The overview's facts, one skeleton row each: applied, fit, salary, location, remote, source. */
export const OVERVIEW_SKELETON_FACTS = ["applied", "fit", "salary", "location", "remote", "source"] as const;

/** The header's chips while they load: stage, plus room for one more. */
export const HEADER_SKELETON_CHIPS = ["stage", "more"] as const;

/**
 * The sections under the overview and notes: a heading, a placeholder for each button the
 * loaded section shows under it (activity: Log event; documents: Write and Upload), then cards.
 */
export const LIST_SKELETON_SECTIONS = [
  { key: "activity", buttons: ["log"] },
  { key: "documents", buttons: ["write", "upload"] },
  { key: "contacts", buttons: [] },
] as const;
