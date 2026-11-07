/**
 * The fixed set of looks a mark can have. Each has its own colour AND its own
 * glyph, so the styles never rely on colour alone. Ids are stored and shared,
 * and `code` is what a share link carries — never change either.
 */
import type { MapMarkStyleDef } from "@/games/wow-forever/types/mapMarks/mapMarkStyleDef";

export const MAP_MARK_STYLE = {
  pin: "pin",
  rare: "rare",
  gathering: "gathering",
  quest: "quest",
  danger: "danger",
  meet: "meet",
} as const;

export type MapMarkStyle = (typeof MAP_MARK_STYLE)[keyof typeof MAP_MARK_STYLE];

export const DEFAULT_MAP_MARK_STYLE: MapMarkStyle = MAP_MARK_STYLE.pin;

export const MAP_MARK_STYLES: readonly MapMarkStyleDef[] = [
  {
    id: MAP_MARK_STYLE.pin,
    code: "p",
    name: "Pin",
    defaultLabel: "Mark",
    glyph: "●",
    fillClass: "fill-slate-100",
    glyphClass: "fill-slate-900",
    swatchClass: "bg-slate-100 text-slate-900",
  },
  {
    id: MAP_MARK_STYLE.rare,
    code: "r",
    name: "Rare or elite",
    defaultLabel: "Rare spawn",
    glyph: "★",
    fillClass: "fill-amber-400",
    glyphClass: "fill-black",
    swatchClass: "bg-amber-400 text-black",
  },
  {
    id: MAP_MARK_STYLE.gathering,
    code: "g",
    name: "Gathering",
    defaultLabel: "Gathering node",
    glyph: "✿",
    fillClass: "fill-green-500",
    glyphClass: "fill-black",
    swatchClass: "bg-green-500 text-black",
  },
  {
    id: MAP_MARK_STYLE.quest,
    code: "q",
    name: "Quest",
    defaultLabel: "Quest spot",
    glyph: "!",
    fillClass: "fill-yellow-300",
    glyphClass: "fill-black",
    swatchClass: "bg-yellow-300 text-black",
  },
  {
    id: MAP_MARK_STYLE.danger,
    code: "d",
    name: "Danger",
    defaultLabel: "Danger",
    glyph: "▲",
    fillClass: "fill-red-600",
    glyphClass: "fill-white",
    swatchClass: "bg-red-600 text-white",
  },
  {
    id: MAP_MARK_STYLE.meet,
    code: "m",
    name: "Meet-up",
    defaultLabel: "Meet here",
    glyph: "⚑",
    fillClass: "fill-sky-500",
    glyphClass: "fill-black",
    swatchClass: "bg-sky-500 text-black",
  },
];

export function isMapMarkStyle(value: unknown): value is MapMarkStyle {
  return MAP_MARK_STYLES.some((s) => s.id === value);
}

export function markStyleDef(id: MapMarkStyle): MapMarkStyleDef {
  return MAP_MARK_STYLES.find((s) => s.id === id) ?? MAP_MARK_STYLES[0];
}
