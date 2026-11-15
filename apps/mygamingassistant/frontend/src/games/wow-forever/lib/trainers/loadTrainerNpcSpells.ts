import type { TrainerNpcSpells } from "@/games/wow-forever/types/trainers/trainerNpcSpells";

let cached: Promise<TrainerNpcSpells> | null = null;

/** Per-trainer recipe lists (cmangos Classic data), loaded once per session. */
export function loadTrainerNpcSpells(): Promise<TrainerNpcSpells> {
  if (!cached) {
    cached = import(
      "@/games/wow-forever/data/professions/crafting/classic/trainerNpcSpells.json"
    ).then((m) => m.default as unknown as TrainerNpcSpells);
    // A failed load must be retryable on the next call.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
