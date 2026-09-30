import type { Level } from "@/types/tutor/level";

export interface LevelOption {
  value: Level;
  label: string;
  description: string;
}

/** Self-described starting points. Order matches ``app/domain/levels.py``. */
export const LEVEL_OPTIONS: readonly LevelOption[] = [
  {
    value: "beginner",
    label: "Just starting",
    description: "I know a few words, or none yet. Keep it short and simple.",
  },
  {
    value: "some_phrases",
    label: "I know some phrases",
    description: "I can greet people and ask simple questions, with pauses.",
  },
  {
    value: "conversational",
    label: "I can hold a conversation",
    description: "I can talk about everyday things, with some mistakes.",
  },
];

export function levelLabel(level: Level): string {
  return LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? level;
}
