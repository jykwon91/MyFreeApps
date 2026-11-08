/**
 * `data/talents/classic/<class>.json` — GENERATED (Classic Era wording + cmangos numbers, GPL-3.0):
 * talent id -> Classic's text per rank. `talents`: the talents whose Forever text differs (a null rank
 * didn't change, or can't be compared). `fallback`: ranks the Forever client doesn't have yet (null where
 * Forever has the rank, or Classic has no text for it either).
 */
export interface ClassicTalentFile {
  source: string;
  classId: string;
  talents: Record<string, (string | null)[]>;
  fallback: Record<string, (string | null)[]>;
}
