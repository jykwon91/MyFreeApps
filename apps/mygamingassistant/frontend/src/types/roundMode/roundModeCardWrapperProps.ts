import type { Lineup } from "@/types/game";
import type { UsePinsReturn } from "@/hooks/usePins";

export interface RoundModeCardWrapperProps {
  lineup: Lineup;
  isActive: boolean;
  pins: UsePinsReturn;
}
