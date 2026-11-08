import BossLootRow from "@/games/wow-forever/components/dungeons/BossLootRow";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RARES_EMPTY } from "@/games/wow-forever/data/rares/raresConfig";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** The rare's own drops (icon, name with its tooltip, chance per kill), tagged Classic data. */
export default function RareDrops({ rare }: { rare: Rare }) {
  if (!rare.classic) return null;
  return (
    <div data-testid="rare-drops">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        Drops <ProvenanceBadge provenance={PROVENANCE.classic} />
      </p>
      {rare.drops.length > 0 ? (
        <ul className="divide-y">
          {rare.drops.map((item) => (
            <BossLootRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{RARES_EMPTY.noDrops}</p>
      )}
    </div>
  );
}
