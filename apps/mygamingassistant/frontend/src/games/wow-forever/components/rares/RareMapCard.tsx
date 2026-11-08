import { Link } from "react-router-dom";
import RareDrops from "@/games/wow-forever/components/rares/RareDrops";
import RareTargetLine from "@/games/wow-forever/components/rares/RareTargetLine";
import RareTitle from "@/games/wow-forever/components/rares/RareTitle";
import { RARES_PAGE_PATH } from "@/games/wow-forever/data/rares/raresConfig";
import { rareIdOfMarker } from "@/games/wow-forever/lib/rares/rareMarkerId";
import type { Rare } from "@/games/wow-forever/types/rares/rare";

interface RareMapCardProps {
  /** Null until the rares have loaded. */
  rares: readonly Rare[] | null;
  /** The selected map marker; the card shows only for a rare's pin. */
  selectedId: string | null;
}

/** Under the map, for a picked rare pin: who it is, its /target line and its drops (with item tooltips). */
export default function RareMapCard({ rares, selectedId }: RareMapCardProps) {
  const rareId = rareIdOfMarker(selectedId);
  const rare = rareId === null ? undefined : rares?.find((r) => r.id === rareId);
  if (!rare) return null;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-label={`Rare: ${rare.name}`} data-testid="rare-map-card">
      <RareTitle rare={rare} as="p" />
      <RareTargetLine name={rare.name} />
      <RareDrops rare={rare} />
      <Link to={RARES_PAGE_PATH} className="inline-flex min-h-[44px] items-center text-sm underline">
        All rares
      </Link>
    </section>
  );
}
