import clsx from "clsx";
import { OutboundLink } from "@platform/ui/discord-activity";
import GearSourceChip from "@/games/wow-forever/components/gear/GearSourceChip";
import { QUALITY_LABELS, QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { describeSource, pctLabel, sourceChipKind } from "@/games/wow-forever/gear/gearSourceText";
import { wowheadForeverItemUrl } from "@/games/wow-forever/lib/wowheadUrl";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";

const BADGE = "inline-block rounded border px-1.5 py-0.5 text-xs text-muted-foreground";

interface GearItemRowProps {
  ranked: RankedGearItem;
  /** The card's first item. */
  isTop: boolean;
}

function levelLabel(requiredLevel: number, availableFrom: number): string {
  const required = requiredLevel > 0 ? `Req. level ${requiredLevel}` : "No level requirement";
  return availableFrom > requiredLevel ? `${required} · get it from level ${availableFrom}` : required;
}

/** One ranked item: name (opens Wowhead), level, how it compares, where it comes from. */
export default function GearItemRow({ ranked, isTop }: GearItemRowProps) {
  const { item, facts, sources } = ranked;
  const level = levelLabel(item.requiredLevel, ranked.availableFrom);
  return (
    <li data-testid="gear-item-row" className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <OutboundLink
          href={wowheadForeverItemUrl(item.id)}
          className={clsx("font-medium underline-offset-2 hover:underline min-h-[44px] sm:min-h-0 inline-flex items-center", QUALITY_TEXT_CLASSES[item.quality])}
          aria-label={`${item.name} (${QUALITY_LABELS[item.quality]}) on Wowhead, opens in a new tab`}
        >
          {item.name}
        </OutboundLink>
        <span className="text-xs text-muted-foreground tabular-nums">
          {pctLabel(ranked.pctOfBest, isTop)} · score {ranked.score.toFixed(1)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{level}</span>
        <GearSourceChip kind={sourceChipKind(sources)} />
        {facts.bindOnPickup ? <span className={BADGE}>Binds when picked up</span> : null}
        {facts.requires ? (
          <span className={BADGE}>
            Needs {facts.requires.skill} {facts.requires.rank}
          </span>
        ) : null}
        {facts.reputation ? (
          <span className={BADGE}>
            {facts.reputation.rank} with {facts.reputation.faction}
          </span>
        ) : null}
        {facts.pvp ? <span className={BADGE}>PvP</span> : null}
      </div>
      {sources.length > 0 ? (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {sources.map((source, index) => (
            // Two quests can read the same (same title and level, different side).
            <li key={`${index}-${describeSource(source)}`}>{describeSource(source)}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
