import BeastName from "@/games/wow-forever/components/hunterPets/BeastName";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { HUNTER_PETS_EMPTY } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { formatAttackSpeed, formatLevelRange } from "@/games/wow-forever/lib/hunterPets/formatHunterPets";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

interface BeastRowProps {
  beast: TamableBeast;
  familyName: string;
}

/** One tamable beast: name and tags, family, level, zones, attack speed and what it teaches. */
export default function BeastRow({ beast, familyName }: BeastRowProps) {
  const level = formatLevelRange(beast);
  const speed = formatAttackSpeed(beast.attackSeconds);
  const unknownDetails = !level && !speed && beast.zones.length === 0;
  return (
    <li className="space-y-1 rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="beast-row">
      <BeastName beast={beast} />
      <p className="text-muted-foreground">
        {[familyName, level ? `level ${level}` : "", speed ? `attacks every ${speed}` : ""].filter(Boolean).join(" · ")}
      </p>
      {beast.zones.length > 0 ? <p className="text-muted-foreground">{beast.zones.join(", ")}</p> : null}
      {unknownDetails ? <p className="text-muted-foreground">{HUNTER_PETS_EMPTY.beastUnknown}</p> : null}
      {beast.teaches.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground">Teaches:</span>
          {beast.teaches.map((t) => (
            <span key={t.spell} className="inline-flex items-center gap-1">
              <GameIcon icon={fileIcon(t.icon)} size={16} alt="" />
              {t.abilityName} (rank {t.rank})
            </span>
          ))}
        </p>
      ) : null}
    </li>
  );
}
