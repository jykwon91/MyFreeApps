import type { ChipDraftField } from "./ChipDraftField";

/** What is typed into each list field but not yet added to it. */
export type ChipDrafts = Partial<Record<ChipDraftField, string>>;
