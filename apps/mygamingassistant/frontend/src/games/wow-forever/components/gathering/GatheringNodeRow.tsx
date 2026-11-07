import SkillColorTag from "@/games/wow-forever/components/gathering/SkillColorTag";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { nodeColor } from "@/games/wow-forever/gathering/nodeColors";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";

interface GatheringNodeRowProps {
  resolved: ResolvedNode;
  /** Your skill; null = none typed, so no colour. */
  skill: number | null;
}

/** One node in the full table: its item's icon, where each colour starts, and its colour for you. */
export default function GatheringNodeRow({ resolved, skill }: GatheringNodeRowProps) {
  const t = resolved.thresholds;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <GameIcon icon={itemIcon(resolved.node.itemId)} size={32} alt="" />
        <div className="min-w-0">
          <p className="font-medium">
            {resolved.node.node}
            {resolved.node.rare && <span className="ml-2 text-xs font-normal text-muted-foreground">rare</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            Orange {t.orange} · Yellow {t.yellow} · Green {t.green} · Gray {t.grey}
          </p>
        </div>
      </div>
      {skill !== null && <SkillColorTag color={nodeColor(t, skill)} />}
    </li>
  );
}
