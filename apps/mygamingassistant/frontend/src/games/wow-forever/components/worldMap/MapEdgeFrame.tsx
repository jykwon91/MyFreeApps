import { useCallback, useRef, useState, type ReactNode } from "react";
import MapEdgeLabel from "@/games/wow-forever/components/worldMap/MapEdgeLabel";
import { useElementSize } from "@/games/wow-forever/hooks/useElementSize";
import { EDGE_BAND_PX, estimateLabelLength, layoutEdgeLabels } from "@/games/wow-forever/worldMap/edgeLabelLayout";
import type { EdgeLabel } from "@/games/wow-forever/worldMap/mapNeighbours";

interface MapEdgeFrameProps {
  labels: readonly EdgeLabel[];
  onOpen: (mapId: number) => void;
  /** The map picture. */
  children: ReactNode;
}

/**
 * The map picture inside a band on every side that names the zones past each
 * border ("Westfall ←"), placed where each one is. The band is outside the
 * picture, so a label never covers a marker, and labels sharing a side are
 * spread apart so they never cover each other.
 */
export default function MapEdgeFrame({ labels, onOpen, children }: MapEdgeFrameProps) {
  const pictureRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(pictureRef);
  const [measured, setMeasured] = useState<ReadonlyMap<number, number>>(new Map());

  const onMeasure = useCallback((mapId: number, length: number) => {
    setMeasured((prev) => {
      if (Math.abs((prev.get(mapId) ?? 0) - length) < 1) return prev;
      return new Map(prev).set(mapId, length);
    });
  }, []);

  if (labels.length === 0) return <div ref={pictureRef}>{children}</div>;
  const placed =
    size && size.width > 0
      ? layoutEdgeLabels(labels, size, (l) => measured.get(l.target.id) ?? estimateLabelLength(l.text))
      : [];

  return (
    <div className="relative" style={{ padding: EDGE_BAND_PX }} data-testid="map-edge-frame">
      <div ref={pictureRef}>{children}</div>
      {size &&
        placed.map((p) => (
          <MapEdgeLabel key={p.label.target.id} placed={p} size={size} onOpen={onOpen} onMeasure={onMeasure} />
        ))}
    </div>
  );
}
