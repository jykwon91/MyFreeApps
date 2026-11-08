/**
 * `data/talents/classic/<class>.json` — GENERATED (Classic Era wording + cmangos numbers, GPL-3.0):
 * talent id -> Classic's text per rank, for the talents whose Forever text differs. A null rank didn't
 * change (or can't be compared).
 */
export interface ClassicTalentFile {
  source: string;
  classId: string;
  talents: Record<string, (string | null)[]>;
}
