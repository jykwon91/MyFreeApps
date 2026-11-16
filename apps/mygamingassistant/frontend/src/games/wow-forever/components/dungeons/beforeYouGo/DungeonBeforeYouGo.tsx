import { ListChecks, Map as MapIcon, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import QuestLineCard from "@/games/wow-forever/components/dungeons/beforeYouGo/QuestLineCard";
import { DETAIL_LINK, DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { BEFORE_YOU_GO_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useQuestsDone } from "@/games/wow-forever/hooks/useQuestsDone";
import { questLines } from "@/games/wow-forever/lib/dungeons/questLines";
import { continentPickupLinks } from "@/games/wow-forever/lib/dungeons/questPickupsMapLinks";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";

interface DungeonBeforeYouGoProps {
  dungeon: Pick<Dungeon, "quests">;
  zones: readonly WorldZone[];
}

/**
 * Every quest to pick up for the dungeon's quests (your faction — the same
 * saved setting the Quests section toggles): one numbered line per dungeon
 * quest with the quests before it, each with its giver, where, directions and
 * a done checkbox (saved in this browser), where you are in each line, and
 * World Map links marking every giver. Nothing to pick up = no section.
 */
export default function DungeonBeforeYouGo({ dungeon, zones }: DungeonBeforeYouGoProps) {
  const [player] = usePlayerSettings();
  const { done, setDone } = useQuestsDone();
  const lines = questLines(dungeon.quests, player.faction);
  if (lines.length === 0) return null;
  const steps = lines.flatMap((l) => l.steps);
  const allLinks = continentPickupLinks(steps, zones);
  const ticked = steps.filter((s) => done.has(s.id)).map((s) => s.id);
  return (
    <section aria-labelledby="dungeon-before-you-go" className={DETAIL_SECTION} data-testid="dungeon-before-you-go">
      <h2 id="dungeon-before-you-go" className="flex items-center gap-2 font-semibold">
        <ListChecks className="h-5 w-5 text-primary" aria-hidden />
        {BEFORE_YOU_GO_COPY.heading}
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {BEFORE_YOU_GO_COPY.intro} <ProvenanceBadge provenance={PROVENANCE.classic} />
      </p>
      <p className="text-sm text-muted-foreground">{BEFORE_YOU_GO_COPY.ticksHint}</p>
      {allLinks.length > 0 ? (
        <ul className="space-y-1">
          {allLinks.map((link) => (
            <li key={link.mapName}>
              <Link to={link.href} className={DETAIL_LINK} data-testid="pickup-all-map-link">
                <MapIcon className="h-4 w-4" aria-hidden />
                {BEFORE_YOU_GO_COPY.showAll(link.count, link.mapName)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-3">
        {lines.map((line) => (
          <QuestLineCard key={line.id} line={line} zones={zones} done={done} setDone={setDone} />
        ))}
      </div>
      {ticked.length > 0 ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted"
          onClick={() => setDone(ticked, false)}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          {BEFORE_YOU_GO_COPY.clear}
        </button>
      ) : null}
    </section>
  );
}
