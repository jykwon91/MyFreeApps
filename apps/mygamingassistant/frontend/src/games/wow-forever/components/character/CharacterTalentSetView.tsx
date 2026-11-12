import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import CharacterTalentSetBody from "@/games/wow-forever/components/character/CharacterTalentSetBody";
import CharacterTalentsSkeleton from "@/games/wow-forever/components/character/CharacterTalentsSkeleton";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { useTalentClass } from "@/games/wow-forever/hooks/useTalentClass";
import type { CharacterTalentGroup } from "@/games/wow-forever/types/character/characterTalentGroup";

interface CharacterTalentSetViewProps {
  classId: WowClassId;
  group: CharacterTalentGroup;
  level: number;
  /** "Active talents" / "Other saved talents" when the character has more than one; null otherwise. */
  label: string | null;
}

/** One saved set, once the class's trees (their own chunk) have loaded. */
export default function CharacterTalentSetView({ classId, group, level, label }: CharacterTalentSetViewProps) {
  const state = useTalentClass(classId);
  if (state.status === "loading") return <CharacterTalentsSkeleton />;
  if (state.status === "error") {
    return <LoadErrorRetry message="Couldn't load the talent trees." onRetry={state.retry} retrying={state.retrying} />;
  }
  return <CharacterTalentSetBody classId={classId} trees={state.data.trees} group={group} level={level} label={label} />;
}
