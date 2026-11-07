/** `data/items/pages/classic/unseen.json`: Classic gear no Forever client has shown yet, as `[id, name]`. */
export interface UnseenItemsFile {
  source: string;
  clientBuild: string;
  items: readonly (readonly [number, string])[];
}
