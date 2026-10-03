import { useId } from "react";
import SlotCell from "@/games/wow-forever/components/raidPlanner/SlotCell";
import { GROUP_SIZE } from "@/games/wow-forever/data/raidPlanner";
import { roleTally, seatsOf } from "@/games/wow-forever/lib/raidGroups";
import { countLabel } from "@/games/wow-forever/lib/raidLabels";
import { tallyLong, tallyShort } from "@/games/wow-forever/lib/raidPlanLabels";
import type { PlannerBoard } from "@/games/wow-forever/types/raidPlan";

interface GroupCardProps {
  /** 1 to the raid's `group_count`. */
  group: number;
  board: PlannerBoard;
}

/** A group: how full it is, its roles ("T1 H1 M2 R1"), then its five seats in order. */
export default function GroupCard({ group, board }: GroupCardProps) {
  const headingId = useId();
  const seats = seatsOf(board.plan.players, board.placements, group);
  const tally = roleTally(seats);
  const filled = seats.filter((seat) => seat !== undefined).length;
  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 id={headingId} className="min-w-0 flex-1 text-sm font-semibold">
          Group {group}
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">{countLabel(filled, GROUP_SIZE)}</span>
      </div>
      <p className="border-b px-3 py-1 text-xs tabular-nums text-muted-foreground">
        <span aria-hidden>{tallyShort(tally)}</span>
        <span className="sr-only">{tallyLong(tally)}</span>
      </p>
      <ol aria-labelledby={headingId} className="divide-y">
        {seats.map((player, index) => (
          <SlotCell key={index} seat={{ group, slot: index + 1 }} player={player} board={board} />
        ))}
      </ol>
    </section>
  );
}
