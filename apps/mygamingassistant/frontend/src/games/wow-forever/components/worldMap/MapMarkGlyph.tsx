import clsx from "clsx";
import { markStyleDef, type MapMarkStyle } from "@/games/wow-forever/data/worldMap/mapMarkStyles";

interface MapMarkGlyphProps {
  /** The point, in the map's SVG pixels. */
  at: { px: number; py: number };
  style: MapMarkStyle;
  /** A shared mark: a dashed outline instead of a solid one. */
  shared?: boolean;
}

/** One mark's look on the map: its colour with its own glyph, so styles never differ by colour alone. */
export default function MapMarkGlyph({ at, style, shared = false }: MapMarkGlyphProps) {
  const def = markStyleDef(style);
  return (
    <g data-mark-style={style}>
      <circle
        cx={at.px}
        cy={at.py}
        r={13}
        strokeWidth={3}
        strokeDasharray={shared ? "5 3" : undefined}
        className={clsx(def.fillClass, shared ? "stroke-violet-200" : "stroke-black/80")}
      />
      <text x={at.px} y={at.py + 5} textAnchor="middle" className={clsx(def.glyphClass, "text-[14px] font-bold")}>
        {def.glyph}
      </text>
    </g>
  );
}
