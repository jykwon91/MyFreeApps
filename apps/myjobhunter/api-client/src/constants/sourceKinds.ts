import type { LabelledOption } from "../types/discovery/labelled-option";
import type { SourceKind } from "../types/discovery/source-kind";

/** The source kinds a new saved search can use, as its picker names them. */
export const SOURCE_KIND_OPTIONS: readonly LabelledOption<SourceKind>[] = [
  { value: "jsearch", label: "JSearch (Google Jobs)" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
];

/** What a source does, shown under the new-saved-search title. */
export const SOURCE_DESCRIPTIONS: Record<SourceKind, string> = {
  jsearch: "JSearch will run this query against Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter).",
  greenhouse: "Fetch all active postings from a company's official Greenhouse job board. No API key required.",
  lever: "Fetch all active postings from a company's official Lever job board. No API key required.",
};

/** The same, as the edit form says it: the source itself can't be changed there. */
export const EDIT_SOURCE_DESCRIPTIONS: Record<SourceKind, string> = {
  jsearch: "Edit this JSearch saved search. Job source cannot be changed — delete and recreate to switch sources.",
  greenhouse: "Edit this Greenhouse board search. Job source cannot be changed — delete and recreate to switch sources.",
  lever: "Edit this Lever board search. Job source cannot be changed — delete and recreate to switch sources.",
};

/** For a source kind this build doesn't know. */
export const EDIT_UNKNOWN_SOURCE_DESCRIPTION = "Edit this saved search. Job source cannot be changed after creation.";
