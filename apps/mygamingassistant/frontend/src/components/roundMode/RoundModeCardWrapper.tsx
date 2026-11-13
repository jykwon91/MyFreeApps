import LineupCard from "@/components/lineup/LineupCard";
import type { RoundModeCardWrapperProps } from "@/types/roundMode/roundModeCardWrapperProps";

/** One pinned lineup's card; the active one is ringed and marked `aria-current`. */
export default function RoundModeCardWrapper({ lineup, isActive, pins }: RoundModeCardWrapperProps) {
  return (
    <div
      aria-current={isActive ? "true" : undefined}
      className={[
        "rounded-xl overflow-hidden transition-all duration-200",
        isActive ? "ring-2 ring-primary shadow-lg scale-[1.01]" : "",
      ].join(" ")}
    >
      <LineupCard
        lineup={lineup}
        variant="expanded"
        isPinned={pins.isPinned(lineup.id)}
        onPinToggle={() => {
          if (pins.isPinned(lineup.id)) {
            pins.unpin(lineup.id);
          } else {
            pins.pin(lineup.id);
          }
        }}
      />
    </div>
  );
}
