/**
 * Read a position the player types or pastes:
 *
 *   45.2, 61.8            45.2 61.8
 *   /way 45.2 61.8        /way Elwynn Forest 45.2 61.8
 *   /mga way 1429 45.2 61.8 Goldshire
 *
 * Returns map percent plus whatever zone the text names (a uiMapID or a zone
 * name) — the caller decides whether to switch zones.
 */
export interface ParsedCoords {
  x: number;
  y: number;
  zoneId?: number;
  zoneName?: string;
}

const NUMBER = String.raw`(\d{1,3}(?:[.,]\d+)?)`;
const MGA_WAY = new RegExp(String.raw`^/mga\s+way\s+(\d+)\s+${NUMBER}[\s,]+${NUMBER}`, "i");
const WAY = new RegExp(String.raw`^/t?way\s+(?:#?(\d+)\s+)?(.*?)\s*${NUMBER}[\s,]+${NUMBER}\s*$`, "i");
const PLAIN = new RegExp(String.raw`^${NUMBER}\s*[,\s]\s*${NUMBER}$`);

function percent(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function build(xRaw: string, yRaw: string, extra: Omit<ParsedCoords, "x" | "y">): ParsedCoords | null {
  const x = percent(xRaw);
  const y = percent(yRaw);
  if (x === null || y === null) return null;
  return { x, y, ...extra };
}

export function parseCoords(text: string): ParsedCoords | null {
  const input = text.trim();
  const mga = MGA_WAY.exec(input);
  if (mga) return build(mga[2], mga[3], { zoneId: Number(mga[1]) });
  const way = WAY.exec(input);
  if (way) {
    const extra: Omit<ParsedCoords, "x" | "y"> = {};
    if (way[1]) extra.zoneId = Number(way[1]);
    const zoneName = way[2].trim();
    if (zoneName) extra.zoneName = zoneName;
    return build(way[3], way[4], extra);
  }
  // "45.2, 61.8": a comma between two numbers is a separator, not a decimal mark.
  const plain = PLAIN.exec(input.replace(/\s*,\s*/, " "));
  if (plain) return build(plain[1], plain[2], {});
  return null;
}
