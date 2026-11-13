import type { Lineup } from "@/types/game";
import type { UsePinsReturn } from "@/hooks/usePins";

export interface RoundModeCardsProps {
  lineups: Lineup[];
  activeCardIndex: number;
  pins: UsePinsReturn;
}
