import AbilityRankRow from "@/games/wow-forever/components/hunterPets/AbilityRankRow";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { HunterFamily } from "@/games/wow-forever/types/hunterPets/hunterFamily";
import type { PetAbility } from "@/games/wow-forever/types/hunterPets/petAbility";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

interface AbilityCardProps {
  ability: PetAbility;
  families: readonly HunterFamily[];
  teachersBySpell: ReadonlyMap<number, readonly TamableBeast[]>;
  seenOn: string;
}

/** One ability with the families that learn it and every rank (open by default for a deep link, closed otherwise). */
export default function AbilityCard({ ability, families, teachersBySpell, seenOn }: AbilityCardProps) {
  const learners = families.filter((f) => ability.familyIds.includes(f.id)).map((f) => f.name);
  return (
    <details className="rounded-xl border bg-card p-3 sm:p-4" data-testid="ability-card" data-ability={ability.slug}>
      <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-2 gap-y-1">
        <GameIcon icon={fileIcon(ability.icon)} size={32} alt="" />
        <span className="font-medium">{ability.name}</span>
        <span className="text-xs text-muted-foreground">{ability.ranks.length} ranks</span>
        {ability.isNew ? <span className="rounded border px-1.5 text-xs">New in Forever</span> : null}
      </summary>
      <div className="mt-2 space-y-3">
        <p className="text-sm text-muted-foreground">Learned by: {learners.join(", ")}</p>
        <ol className="space-y-2">
          {ability.ranks.map((rank) => (
            <AbilityRankRow
              key={rank.spell}
              rank={rank}
              abilityIsNew={ability.isNew}
              teachers={teachersBySpell.get(rank.spell) ?? []}
              seenOn={seenOn}
            />
          ))}
        </ol>
      </div>
    </details>
  );
}
