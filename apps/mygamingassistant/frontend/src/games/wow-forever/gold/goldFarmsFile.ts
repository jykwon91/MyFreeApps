/** `data/gold/classic/goldFarms.json` as generated: one array per farm, in `columns` order. */
export interface GoldFarmsFile {
  columns: readonly string[];
  zones: Readonly<Record<string, string>>;
  farms: readonly (readonly (string | number)[])[];
}
