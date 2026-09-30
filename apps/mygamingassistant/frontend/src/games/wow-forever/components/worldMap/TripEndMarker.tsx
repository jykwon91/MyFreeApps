import clsx from "clsx";
import MapPointLabel from "@/games/wow-forever/components/worldMap/MapPointLabel";

interface TripEndMarkerProps {
  /** The point, in the map's SVG pixels. */
  at: { px: number; py: number };
  letter: "A" | "B";
  /** Accessible name ("Start: Near Goldshire"). */
  label: string;
  /** Shown over the marker. */
  name: string;
  start?: boolean;
}

/** A trip end on the map, like a maps app: A (green) where you start, B (red) where you're going. */
export default function TripEndMarker({ at, letter, label, name, start = false }: TripEndMarkerProps) {
  return (
    <g aria-label={label} className="pointer-events-none">
      <circle
        cx={at.px}
        cy={at.py}
        r={15}
        strokeWidth={4}
        className={clsx("stroke-white", start && "fill-emerald-600", !start && "fill-red-600")}
      />
      <text x={at.px} y={at.py + 6} textAnchor="middle" className="fill-white text-[17px] font-bold">
        {letter}
      </text>
      <MapPointLabel x={at.px} y={at.py} text={name} />
    </g>
  );
}
