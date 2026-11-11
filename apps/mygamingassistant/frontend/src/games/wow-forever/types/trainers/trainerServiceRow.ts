/**
 * One `classicServices.json` row:
 * [guid, npcId, subkind, tag, name, title, zone, subzone, x, y, z, faction].
 */
export type TrainerServiceRow = readonly [
  number,
  number,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  number,
  number,
  "A" | "H" | "N",
];
