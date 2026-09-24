/**
 * Where each neighbour label sits in the band around a zone map.
 *
 * Labels live in a reserved band OUTSIDE the map picture (so they can never
 * cover a marker), one band per side. Within a band each label wants to be
 * centred where its neighbour is; labels that would collide are pushed apart
 * along the band and clamped inside it, and when a band is too short for all
 * of them at full length they share it (the text is truncated, the full name
 * stays in the tooltip and accessible name).
 */
import { MAP_EDGE, type EdgeLabel, type MapEdge } from "@/games/wow-forever/worldMap/mapNeighbours";

/** Thickness of each band around the picture, in px. */
export const EDGE_BAND_PX = 32;
/** A label's thickness across its band, in px (the band leaves 2px either side). */
export const EDGE_LABEL_THICKNESS_PX = 28;
/** Space kept between two labels in one band, in px. */
export const EDGE_LABEL_GAP_PX = 4;

/** A label's padding (px-2 / py-2) plus border, along its band. */
export const EDGE_LABEL_CHROME_PX = 18;

/**
 * A safe over-estimate of a label's natural length (text-xs medium): used
 * before the real size is measured, and by the tests.
 */
export function estimateLabelLength(text: string): number {
  return Math.ceil(text.length * 7.5 + EDGE_LABEL_CHROME_PX);
}

export interface EdgeSlot {
  /** Offset from the start of the band (left for north/south, top for west/east), px. */
  start: number;
  /** Length along the band, px — shorter than the natural length when the band is crowded. */
  length: number;
}

interface EdgeItem {
  /** Where the label wants its middle, px along the band. */
  centre: number;
  /** Natural length along the band, px. */
  length: number;
}

/** The largest cap c with sum(min(length, c)) + gaps <= band: shared fairly, short labels untouched. */
function fairCap(lengths: readonly number[], room: number): number {
  const sorted = [...lengths].sort((a, b) => a - b);
  let left = room;
  for (let i = 0; i < sorted.length; i++) {
    const share = left / (sorted.length - i);
    if (sorted[i] > share) return share;
    left -= sorted[i];
  }
  return Infinity;
}

/**
 * Place labels in one band of `band` px: as near their wanted centres as
 * possible, in order, never overlapping, never past either end. Returns slots
 * in the input's order.
 */
export function layoutEdge(items: readonly EdgeItem[], band: number): EdgeSlot[] {
  if (items.length === 0) return [];
  const gaps = EDGE_LABEL_GAP_PX * (items.length - 1);
  const cap = fairCap(
    items.map((i) => i.length),
    Math.max(0, band - gaps),
  );
  const order = items.map((_, index) => index).sort((a, b) => items[a].centre - items[b].centre);
  const lengths = order.map((index) => Math.min(items[index].length, cap));
  const starts = order.map((index, k) => Math.min(Math.max(0, items[index].centre - lengths[k] / 2), band - lengths[k]));
  // Push right past the previous label, then back left from the far end.
  for (let k = 1; k < starts.length; k++) {
    starts[k] = Math.max(starts[k], starts[k - 1] + lengths[k - 1] + EDGE_LABEL_GAP_PX);
  }
  for (let k = starts.length - 1; k >= 0; k--) {
    const limit = k === starts.length - 1 ? band - lengths[k] : starts[k + 1] - EDGE_LABEL_GAP_PX - lengths[k];
    starts[k] = Math.max(0, Math.min(starts[k], limit));
  }
  const slots: EdgeSlot[] = new Array(items.length);
  order.forEach((index, k) => {
    slots[index] = { start: starts[k], length: lengths[k] };
  });
  return slots;
}

export interface PlacedEdgeLabel {
  label: EdgeLabel;
  slot: EdgeSlot;
}

export interface PictureSize {
  width: number;
  height: number;
}

export function isSideways(edge: MapEdge): boolean {
  return edge === MAP_EDGE.west || edge === MAP_EDGE.east;
}

/** Every label's slot, band by band, for a picture of `size` px. */
export function layoutEdgeLabels(
  labels: readonly EdgeLabel[],
  size: PictureSize,
  lengthOf: (label: EdgeLabel) => number,
): PlacedEdgeLabel[] {
  const placed: PlacedEdgeLabel[] = [];
  for (const edge of Object.values(MAP_EDGE)) {
    const onEdge = labels.filter((l) => l.edge === edge);
    const band = isSideways(edge) ? size.height : size.width;
    const slots = layoutEdge(
      onEdge.map((l) => ({ centre: (l.along / 100) * band, length: lengthOf(l) })),
      band,
    );
    onEdge.forEach((label, i) => placed.push({ label, slot: slots[i] }));
  }
  return placed;
}

export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A placed label's box in the whole frame (bands + picture), px from its top-left corner. */
export function frameRect({ label, slot }: PlacedEdgeLabel, size: PictureSize): FrameRect {
  const inset = (EDGE_BAND_PX - EDGE_LABEL_THICKNESS_PX) / 2;
  const thick = EDGE_LABEL_THICKNESS_PX;
  if (label.edge === MAP_EDGE.north) return { left: EDGE_BAND_PX + slot.start, top: inset, width: slot.length, height: thick };
  if (label.edge === MAP_EDGE.south) {
    return { left: EDGE_BAND_PX + slot.start, top: EDGE_BAND_PX + size.height + inset, width: slot.length, height: thick };
  }
  if (label.edge === MAP_EDGE.west) return { left: inset, top: EDGE_BAND_PX + slot.start, width: thick, height: slot.length };
  return { left: EDGE_BAND_PX + size.width + inset, top: EDGE_BAND_PX + slot.start, width: thick, height: slot.length };
}
