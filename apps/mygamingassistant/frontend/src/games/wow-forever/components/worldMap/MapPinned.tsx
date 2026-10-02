import type { ReactNode } from "react";

interface MapPinnedProps {
  /** The point on the map picture (map pixels) the contents stay centred on. */
  at: { px: number; py: number };
  scale: number;
  children: ReactNode;
}

/** Keeps what's inside the same size on screen however far the map is zoomed, around its point. */
export default function MapPinned({ at, scale, children }: MapPinnedProps) {
  if (scale === 1) return <>{children}</>;
  return <g transform={`translate(${at.px} ${at.py}) scale(${1 / scale}) translate(${-at.px} ${-at.py})`}>{children}</g>;
}
