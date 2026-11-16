import clsx from "clsx";
import { Navigation, Swords } from "lucide-react";
import { Link } from "react-router-dom";
import InsideDungeonChip from "@/games/wow-forever/components/dungeons/quests/InsideDungeonChip";
import { DETAIL_CHIP, DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { BEFORE_YOU_GO_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { directionsHref } from "@/games/wow-forever/food/recipeSources";
import { questLevelText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import type { QuestPickup } from "@/games/wow-forever/types/dungeons/questPickup";
import { QUEST_TARGET_KIND } from "@/games/wow-forever/types/dungeons/questTargetKind";
import { formatMapCoords } from "@/games/wow-forever/worldMap/routeDistance";

interface PickupRowProps {
  pickup: QuestPickup;
  /** Its number in the line (1 = first). */
  step: number;
  done: boolean;
  /** True for the next step to do — it's highlighted. */
  next: boolean;
  onToggle: () => void;
}

/** One step of a quest line: a done checkbox, the quest (to its page) and level, then who gives it and where. */
export default function PickupRow({ pickup, step, done, next, onToggle }: PickupRowProps) {
  const { giver } = pickup;
  const place = giver?.place ?? null;
  const isItem = giver?.kind === QUEST_TARGET_KIND.item;
  return (
    <li
      className={clsx("flex gap-2 rounded-md py-1.5 pr-1", next && "bg-primary/10")}
      data-testid="pickup-row"
      data-quest-id={pickup.id}
      data-done={done}
      aria-current={next ? "step" : undefined}
    >
      <label className="flex min-h-11 min-w-11 cursor-pointer items-start justify-center pt-1">
        <input type="checkbox" className="h-5 w-5 accent-primary" checked={done} onChange={onToggle} />
        <span className="sr-only">{BEFORE_YOU_GO_COPY.doneLabel(step, pickup.title)}</span>
      </label>
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">{step}.</span>
          <Link to={questPageHref(pickup.id)} className={clsx(DETAIL_LINK, done && "line-through opacity-70")}>
            {pickup.title}
          </Link>
          <span className="text-muted-foreground">{questLevelText(pickup)}</span>
          {pickup.dungeonQuest ? (
            <span className={DETAIL_CHIP}>
              <Swords className="mr-1 inline h-3 w-3" aria-hidden />
              {BEFORE_YOU_GO_COPY.dungeonQuest}
            </span>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {giver ? (
            <span className="font-medium text-foreground">
              {isItem ? <ItemIcon itemId={giver.id} /> : null}
              {giver.name}
              {isItem ? <span className="font-normal text-muted-foreground"> ({BEFORE_YOU_GO_COPY.itemStarts})</span> : null}
            </span>
          ) : (
            <span>{BEFORE_YOU_GO_COPY.noGiver}</span>
          )}
          {giver?.insideDungeon ? <InsideDungeonChip /> : null}
          {place ? (
            <>
              <span>{[place.zoneName, place.subzone, formatMapCoords(place.x, place.y)].filter(Boolean).join(" · ")}</span>
              <Link to={directionsHref({ zoneId: place.zoneId, x: place.x, y: place.y })} className={DETAIL_LINK}>
                <Navigation className="h-3.5 w-3.5" aria-hidden />
                Directions
                <span className="sr-only"> to {giver?.name}</span>
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}
