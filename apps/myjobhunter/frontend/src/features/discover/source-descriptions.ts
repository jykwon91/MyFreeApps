import type { SourceKind } from "@/types/discovery/source-kind";

/** What a source does, shown under the title of the new-saved-search dialog. */
export const SOURCE_DESCRIPTIONS: Record<SourceKind, string> = {
  jsearch: "JSearch will run this query against Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter).",
  greenhouse: "Fetch all active postings from a company's official Greenhouse job board. No API key required.",
  lever: "Fetch all active postings from a company's official Lever job board. No API key required.",
};

/** The same per source, as the edit dialog says it: the source itself can't be changed there. */
export const EDIT_SOURCE_DESCRIPTIONS: Record<SourceKind, string> = {
  jsearch:
    "Edit this JSearch saved search. Job source cannot be changed — delete and recreate to switch sources.",
  greenhouse:
    "Edit this Greenhouse board search. Job source cannot be changed — delete and recreate to switch sources.",
  lever:
    "Edit this Lever board search. Job source cannot be changed — delete and recreate to switch sources.",
};
