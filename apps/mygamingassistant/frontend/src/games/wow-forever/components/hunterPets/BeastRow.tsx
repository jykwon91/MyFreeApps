import BeastName from "@/games/wow-forever/components/hunterPets/BeastName";
import { HUNTER_PETS_EMPTY } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import { formatAttackSpeed, formatLevelRange } from "@/games/wow-forever/lib/hunterPets/formatHunterPets";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

interface BeastRowProps {
  beast: TamableBeast;
  familyName: string;
  seenOn: string;
}

/** One tamable beast: name and tags, family, level, zones, attack speed and what it teaches. */
export default function BeastRow({ beast, familyName, seenOn }: BeastRowProps) {
  const level = formatLevelRange(beast);
  const speed = formatAttackSpeed(beast.attackSeconds);
  const unknownDetails = !level && !speed && beast.zones.length === 0;
  return (
    <li className="space-y-1 rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="beast-row">
      <BeastName beast={beast} seenOn={seenOn} />
      <p className="text-muted-foreground">
        {[familyName, level ? `level ${level}` : "", speed ? `attacks every ${speed}` : ""].filter(Boolean).join(" · ")}
      </p>
      {beast.zones.length > 0 ? <p className="text-muted-foreground">{beast.zones.join(", ")}</p> : null}
      {unknownDetails ? <p className="text-muted-foreground">{HUNTER_PETS_EMPTY.beastUnknown}</p> : null}
      {beast.teaches.length > 0 ? (
        <p>
          <span className="text-muted-foreground">Teaches: </span>
          {beast.teaches.map((t) => `${t.abilityName} (rank ${t.rank})`).join(", ")}
        </p>
      ) : null}
    </li>
  );
}
