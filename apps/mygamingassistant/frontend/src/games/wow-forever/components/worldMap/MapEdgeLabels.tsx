import type { CSSProperties } from "react";
import { MAP_EDGE, type EdgeLabel, type MapEdge } from "@/games/wow-forever/worldMap/mapHitTest";

interface MapEdgeLabelsProps {
  labels: readonly EdgeLabel[];
  onOpen: (mapId: number) => void;
}

/** Keep labels off the very corners so two edges' labels don't collide. */
const EDGE_INSET = { min: 8, max: 92 } as const;

/**
 * Pin the label at `along` on its edge. The label's own anchor slides with
 * it (0% of its size at the start of the edge, 100% at the end), so a label
 * near a corner stays on the map instead of hanging off it.
 */
function place(edge: MapEdge, along: number): CSSProperties {
  const clamped = Math.min(EDGE_INSET.max, Math.max(EDGE_INSET.min, along));
  const at = `${clamped}%`;
  if (edge === MAP_EDGE.west) return { left: 4, top: at, transform: `translateY(-${clamped}%)` };
  if (edge === MAP_EDGE.east) return { right: 4, top: at, transform: `translateY(-${clamped}%)` };
  if (edge === MAP_EDGE.north) return { top: 4, left: at, transform: `translateX(-${clamped}%)` };
  return { bottom: 4, left: at, transform: `translateX(-${clamped}%)` };
}

/** The zones past each edge of a zone map, named where they touch it ("Westfall ←"); click to go there. */
export default function MapEdgeLabels({ labels, onOpen }: MapEdgeLabelsProps) {
  return (
    <>
      {labels.map((label) => (
        <button
          key={label.target.id}
          type="button"
          aria-label={`Go to ${label.target.name}`}
          title={`Go to ${label.target.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => onOpen(label.target.id)}
          className="absolute z-10 whitespace-nowrap rounded-md border border-white/30 bg-black/65 px-2 text-xs font-medium text-white shadow min-h-[32px] hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          style={place(label.edge, label.along)}
        >
          {label.text}
        </button>
      ))}
    </>
  );
}
