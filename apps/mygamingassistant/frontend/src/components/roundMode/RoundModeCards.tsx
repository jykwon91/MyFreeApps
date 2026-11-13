import type { RoundModeCardsProps } from "@/types/roundMode/roundModeCardsProps";
import RoundModeCardWrapper from "./RoundModeCardWrapper";

export default function RoundModeCards({ lineups, activeCardIndex, pins }: RoundModeCardsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {lineups.map((lineup, i) => (
        <RoundModeCardWrapper
          key={lineup.id}
          lineup={lineup}
          isActive={i === activeCardIndex}
          pins={pins}
        />
      ))}
    </div>
  );
}
