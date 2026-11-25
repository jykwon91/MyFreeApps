import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { describeAmount, describeMage } from "@/games/wow-forever/food/restoreText";
import type { RestoreOption } from "@/games/wow-forever/types/restoreOption";
import type { RestoreTrack } from "@/games/wow-forever/types/restoreTrack";

/** The Mage's conjured food or drink, first in its section: free, at the highest rank you can eat. */
export default function RestoreMageRow({ option, track }: { option: RestoreOption; track: RestoreTrack }) {
  return (
    <li className="rounded-lg border-2 border-primary bg-card p-3 space-y-1" data-testid="restore-mage">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">
          <ItemNameLink itemId={option.id} name={option.name} withIcon />
        </span>
        <span className="text-sm text-muted-foreground">{describeAmount(option, track)}</span>
      </p>
      <p className="text-xs font-medium text-primary">{describeMage(option)}</p>
    </li>
  );
}
