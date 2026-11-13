import type { Lineup } from "@/types/game";
import type { UsePinsReturn } from "@/hooks/usePins";

export interface RoundModeBodyProps {
  isFetching: boolean;
  pinnedLineups: Lineup[];
  activeCardIndex: number;
  pins: UsePinsReturn;
  planModeHref: string;
}
