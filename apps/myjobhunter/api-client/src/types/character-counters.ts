/** Each text field's "5,100 / 5,000" counter, present only for a field close to or over its limit. */
export type CharacterCounters<Field extends string> = Partial<Record<Field, string>>;
