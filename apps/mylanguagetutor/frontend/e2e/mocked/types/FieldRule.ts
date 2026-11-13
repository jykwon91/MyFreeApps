/** One field of a backend request schema: a bounded string (optionally not blank) or the Level enum. */
export type FieldRule =
  | { name: string; kind: "string"; maxLength: number; notBlank?: boolean }
  | { name: string; kind: "level" };
