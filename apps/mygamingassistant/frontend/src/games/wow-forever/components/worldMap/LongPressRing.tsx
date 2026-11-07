import { LONG_PRESS_FEEDBACK_MS, LONG_PRESS_MS } from "@/games/wow-forever/data/worldMap/mapMarks";
import type { PressRing } from "@/games/wow-forever/types/mapMarks/pressRing";

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A ring that fills under a held finger, so the player sees the press is about to open the map menu. */
export default function LongPressRing({ ring }: { ring: PressRing }) {
  const size = RADIUS * 2 + 8;
  return (
    <svg
      aria-hidden
      data-testid="long-press-ring"
      width={size}
      height={size}
      className="pointer-events-none absolute z-[900]"
      style={{ left: ring.boxX - size / 2, top: ring.boxY - size / 2 }}
    >
      <circle cx={size / 2} cy={size / 2} r={RADIUS} fill="none" strokeWidth={4} className="stroke-black/40" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={4}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="stroke-white"
      >
        <animate
          attributeName="stroke-dashoffset"
          from={CIRCUMFERENCE}
          to={0}
          dur={`${LONG_PRESS_MS - LONG_PRESS_FEEDBACK_MS}ms`}
          fill="freeze"
        />
      </circle>
    </svg>
  );
}
