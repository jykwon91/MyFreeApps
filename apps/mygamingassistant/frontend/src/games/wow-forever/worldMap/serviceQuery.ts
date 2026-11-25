import { normalizeText } from "@/games/wow-forever/worldMap/searchText";

/** The words players use for a flight master: "flight path", "flight point", "FP". */
const FLIGHT_MASTER_WORDS = /\b(?:flight ?(?:paths?|points?|masters?)|fps?)\b/g;

/** Words that only join a kind of NPC to a place ("innkeeper in feralas"), never part of a name. */
const JOINING_WORDS: ReadonlySet<string> = new Set(["in", "at", "near", "around", "from"]);

/**
 * What an NPC search box was asked, in the words the data uses: every way of
 * saying "flight master" becomes that, and "in" / "near" between a kind and a
 * place is dropped. A lone joining word is left alone.
 */
export function normalizeNpcQuery(query: string): string {
  const words = normalizeText(query).replace(FLIGHT_MASTER_WORDS, "flight master").split(" ");
  const kept = words.filter((word) => !JOINING_WORDS.has(word));
  return (kept.length ? kept : words).join(" ");
}
