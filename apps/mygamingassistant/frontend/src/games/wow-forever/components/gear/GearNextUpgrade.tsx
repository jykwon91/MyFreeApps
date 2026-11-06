import { OutboundLink } from "@platform/ui/discord-activity";
import clsx from "clsx";
import GearSourceChip from "@/games/wow-forever/components/gear/GearSourceChip";
import { QUALITY_LABELS, QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { sourceChipKind } from "@/games/wow-forever/gear/gearSourceText";
import { wowheadForeverItemUrl } from "@/games/wow-forever/lib/wowheadUrl";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";

/** "Next upgrade at level 38: Battle Healer's Cloak (135% of your top pick)". */
export default function GearNextUpgrade({ upgrade }: { upgrade: RankedGearItem }) {
  return (
    <p data-testid="gear-next-upgrade" className="flex flex-wrap items-center gap-1.5 border-t pt-3 text-sm">
      <span className="text-muted-foreground">
        Next upgrade at {upgrade.availableFromEstimated ? "about " : ""}level {upgrade.availableFrom}:
      </span>
      <OutboundLink
        href={wowheadForeverItemUrl(upgrade.item.id)}
        className={clsx("font-medium underline-offset-2 hover:underline", QUALITY_TEXT_CLASSES[upgrade.item.quality])}
        aria-label={`${upgrade.item.name} (${QUALITY_LABELS[upgrade.item.quality]}) on Wowhead, opens in a new tab`}
      >
        {upgrade.item.name}
      </OutboundLink>
      <span className="text-xs text-muted-foreground">({upgrade.pctOfBest}% of your top pick)</span>
      <GearSourceChip kind={sourceChipKind(upgrade.sources)} />
    </p>
  );
}
