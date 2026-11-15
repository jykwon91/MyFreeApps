import CraftRankTrainer from "@/games/wow-forever/components/crafting/CraftRankTrainer";
import RankTrainerList from "@/games/wow-forever/components/professions/RankTrainerList";
import { useTrainerNpcSpells } from "@/games/wow-forever/hooks/useTrainerNpcSpells";
import { recipeRank, trainersTeaching } from "@/games/wow-forever/lib/recipes/recipeTrainers";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface RecipeTrainerWhereProps {
  profession: CraftingProfession;
  professionLabel: string;
  spell: number;
  skill: number;
  faction: PlayerFaction;
  zoneId: number | null;
}

/** The trainers for your faction who teach a trainer recipe: where they stand, with a map link. */
export default function RecipeTrainerWhere({ profession, professionLabel, spell, skill, faction, zoneId }: RecipeTrainerWhereProps) {
  const npcSpells = useTrainerNpcSpells();
  const rank = recipeRank(profession, skill);
  if (rank.trainers.kind !== "list") {
    return <CraftRankTrainer rank={rank} faction={faction} professionLabel={professionLabel} zoneId={zoneId} />;
  }
  const map = npcSpells.status === "ready" ? npcSpells.data[profession] : null;
  return (
    <RankTrainerList
      label={`${rank.name} ${professionLabel}`}
      trainers={trainersTeaching(rank.trainers.trainers[faction], spell, map)}
      zoneId={zoneId}
    />
  );
}
