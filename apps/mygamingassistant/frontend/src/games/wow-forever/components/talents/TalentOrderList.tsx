import { ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { useState } from "react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { MIN_TALENT_LEVEL } from "@/games/wow-forever/data/talents/talentConfig";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { TalentOrderEntry } from "@/games/wow-forever/types/talents/talentOrderEntry";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface TalentOrderListProps {
  order: readonly TalentOrderEntry[];
  trees: readonly TalentTree[];
  onRemoveLast: () => void;
}

/**
 * The sequence of talent points spent, shown as "Level N: Tree — Talent".
 * Collapsible on mobile. The last entry has an undo button.
 */
export default function TalentOrderList({ order, trees, onRemoveLast }: TalentOrderListProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (order.length === 0) {
    return (
      <section
        aria-label="Talent spend order"
        className="rounded-xl border bg-card p-4"
        data-testid="talent-order-list"
      >
        <p className="text-sm text-muted-foreground">
          Spend a point to start recording the order.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Talent spend order"
      className="rounded-xl border bg-card"
      data-testid="talent-order-list"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
        aria-expanded={!collapsed}
        aria-controls="talent-order-entries"
      >
        <span className="font-semibold text-sm">
          Spend order{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            ({order.length} {order.length === 1 ? "point" : "points"})
          </span>
        </span>
        {collapsed ? (
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronUp aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {!collapsed && (
        <ol
          id="talent-order-entries"
          className="border-t divide-y"
          data-testid="talent-order-entries"
        >
          {order.map(([tree, talent], idx) => {
            const level = MIN_TALENT_LEVEL + idx;
            const treeData = trees[tree];
            const talentData = treeData?.talents[talent];
            const isLast = idx === order.length - 1;
            return (
              <li
                key={idx}
                className="flex items-center gap-3 px-4 py-2 text-sm"
                data-testid={isLast ? "talent-order-last" : undefined}
              >
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                  Level {level}
                </span>
                <GameIcon icon={fileIcon(talentData?.icon ?? 0)} size={24} alt="" />
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground">{treeData?.name}</span>
                  {" — "}
                  <span className="font-medium">{talentData?.name ?? "?"}</span>
                </span>
                {isLast && (
                  <button
                    type="button"
                    onClick={onRemoveLast}
                    aria-label={`Undo last point (${talentData?.name ?? "?"})`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border hover:bg-muted/40"
                    data-testid="talent-order-undo"
                  >
                    <Undo2 aria-hidden className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
