import { SATELLITE_LABEL_HALO } from "@/games/wow-forever/data/worldMap/mapStyle";

interface MapPointLabelProps {
  /** The point, in the map's SVG pixels. */
  x: number;
  y: number;
  text: string;
}

/** A name over a point of the map, outlined so it reads on any map art (a heavier halo on the satellite view). */
export default function MapPointLabel({ x, y, text }: MapPointLabelProps) {
  return (
    <text
      x={x}
      y={y - 28}
      textAnchor="middle"
      strokeWidth={5}
      paintOrder="stroke"
      className={`pointer-events-none fill-white stroke-black/80 text-[20px] font-semibold ${SATELLITE_LABEL_HALO}`}
    >
      {text}
    </text>
  );
}
