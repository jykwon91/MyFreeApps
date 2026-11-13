import { ids } from "@/games/wow-forever/lib/quests/questRowDecode";
import type { QuestChainStep } from "@/games/wow-forever/types/dungeons/questChainStep";
import type { QuestDataRow } from "@/games/wow-forever/types/quests/questDataRow";

/** The quests in a line, in order; one the data can't name is left out. */
export function chainSteps(value: unknown, step: (id: number) => QuestChainStep | null): QuestChainStep[] {
  return ids(value).flatMap((id) => step(id) ?? []);
}

/** A step named as the operator's client saw it when it has, else as Classic has it. */
export function seenStep(
  classic: QuestChainStep,
  seenRow: QuestDataRow | null,
  seenAt: Readonly<Record<"title" | "level", number>>,
): QuestChainStep {
  if (!seenRow) return classic;
  return { ...classic, title: String(seenRow[seenAt.title]), level: Number(seenRow[seenAt.level]) };
}
