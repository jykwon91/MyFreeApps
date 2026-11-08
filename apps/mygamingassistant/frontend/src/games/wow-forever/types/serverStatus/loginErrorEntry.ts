import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/** One login / connection problem in the help list. Written by us, in plain words. */
export interface LoginErrorEntry {
  /** Anchor id after `err-`: lower case letters, digits and dashes. Never change one — it's a link. */
  id: string;
  /** The error code the game shows, if it has one (e.g. "WOW51900319"). */
  code: string | null;
  /** The message or situation, as a player would describe it. */
  title: string;
  /** Other words players search with. */
  aliases: readonly string[];
  /** What it means, one or two sentences. */
  meaning: string;
  /** What to try, quickest first. */
  steps: readonly string[];
  provenance: ProvenanceTag;
}
