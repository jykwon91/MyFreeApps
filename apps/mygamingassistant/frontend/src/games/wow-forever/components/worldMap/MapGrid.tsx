interface MapGridProps {
  width: number;
  height: number;
}

/** Fallback when a zone's map picture is missing: a 10% grid, matching the coordinates. */
export default function MapGrid({ width, height }: MapGridProps) {
  const lines = Array.from({ length: 9 }, (_, i) => (i + 1) * 10);
  return (
    <g className="stroke-muted-foreground/30" strokeWidth={1}>
      {lines.map((v) => (
        <line key={`v${v}`} x1={(v / 100) * width} y1={0} x2={(v / 100) * width} y2={height} />
      ))}
      {lines.map((v) => (
        <line key={`h${v}`} x1={0} y1={(v / 100) * height} x2={width} y2={(v / 100) * height} />
      ))}
    </g>
  );
}
