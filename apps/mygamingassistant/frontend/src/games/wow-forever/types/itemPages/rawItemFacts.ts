/** One item's facts in a Forever shard; a missing key = nothing known. */
export interface RawItemFacts {
  bind?: number;
  buy?: number;
  /** `[profession, skill, spell, recipe, [[reagentId, count, name]], learn, learnItem]`. */
  crafted?: readonly (readonly unknown[])[];
}
