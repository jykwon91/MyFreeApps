import type { RoundModeBodyProps } from "@/types/roundMode/roundModeBodyProps";
import RoundModeCards from "./RoundModeCards";
import RoundModeEmpty from "./RoundModeEmpty";
import RoundModeLoadingSkeleton from "./RoundModeLoadingSkeleton";

export default function RoundModeBody({
  isFetching,
  pinnedLineups,
  activeCardIndex,
  pins,
  planModeHref,
}: RoundModeBodyProps) {
  if (isFetching) return <RoundModeLoadingSkeleton />;
  if (pinnedLineups.length === 0) return <RoundModeEmpty planModeHref={planModeHref} />;
  return <RoundModeCards lineups={pinnedLineups} activeCardIndex={activeCardIndex} pins={pins} />;
}
