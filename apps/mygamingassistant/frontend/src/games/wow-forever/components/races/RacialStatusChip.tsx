import clsx from "clsx";
import { RACIAL_STATUS, RACIAL_STATUS_LABEL } from "@/games/wow-forever/data/races/racesConfig";
import type { RacialStatus } from "@/games/wow-forever/types/races/racialStatus";

/** "New in Forever" / "Changed in Forever" / "Same as Classic" / "Removed in Forever" — the word carries it, not colour. */
export default function RacialStatusChip({ status }: { status: RacialStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        status === RACIAL_STATUS.unchanged ? "text-muted-foreground" : "font-medium",
      )}
      data-testid="racial-status"
      data-status={status}
    >
      {RACIAL_STATUS_LABEL[status]}
    </span>
  );
}
