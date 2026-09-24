import { useLayoutEffect, useRef, type CSSProperties } from "react";
import clsx from "clsx";
import {
  EDGE_LABEL_CHROME_PX,
  frameRect,
  isSideways,
  type PictureSize,
  type PlacedEdgeLabel,
} from "@/games/wow-forever/worldMap/edgeLabelLayout";

interface MapEdgeLabelProps {
  placed: PlacedEdgeLabel;
  size: PictureSize;
  onOpen: (mapId: number) => void;
  /** Reports the label's natural length along its band (px), so the layout can use the real size. */
  onMeasure: (mapId: number, length: number) => void;
}

/**
 * One neighbour's name in the band around the map ("Westfall ←"); click to go
 * there. The side bands set the name top-to-bottom, with the arrow kept
 * upright so it still points out of the map.
 */
export default function MapEdgeLabel({ placed, size, onOpen, onMeasure }: MapEdgeLabelProps) {
  const { label } = placed;
  const textRef = useRef<HTMLSpanElement>(null);
  const sideways = isSideways(label.edge);
  const rect = frameRect(placed, size);
  const [name, arrow] = [label.target.name, label.text.slice(label.target.name.length).trim()];

  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    // The inline text keeps its natural size even while the button truncates it.
    const box = text.getBoundingClientRect();
    onMeasure(label.target.id, Math.ceil((sideways ? box.height : box.width) + EDGE_LABEL_CHROME_PX));
  });

  const style: CSSProperties = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  if (sideways) style.writingMode = "vertical-rl";

  return (
    <button
      type="button"
      aria-label={`Go to ${label.target.name}`}
      title={`Go to ${label.target.name}`}
      data-edge={label.edge}
      onClick={() => onOpen(label.target.id)}
      className={clsx(
        "absolute z-10 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-white/30 bg-black/70 text-xs font-medium leading-none text-white shadow hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
        sideways && "py-2",
        !sideways && "px-2",
      )}
      style={style}
    >
      <span ref={textRef}>
        {name} <span style={{ textOrientation: "upright" }}>{arrow}</span>
      </span>
    </button>
  );
}
