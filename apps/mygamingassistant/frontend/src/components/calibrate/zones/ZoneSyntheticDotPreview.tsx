/**
 * ZoneSyntheticDotPreview — drag a synthetic player dot to verify polygons.
 *
 * Shown above the editor canvas when the operator clicks "Preview" instead
 * of "Edit". The orange dot is draggable; we re-run the JS point-in-polygon
 * test on each move and highlight the matched polygon (or surface
 * "Unzoned" when no zone contains the dot).
 *
 * Mirrors the Rust polygon test exactly (`lib/calibration.findZone`), so
 * the preview matches what the pipeline will compute in live mode.
 */
import { useEffect, useRef, useState } from "react";
import { findZone } from "@/lib/calibration";
import type { CvZonePolygon } from "@/types/desktop";

interface ZoneSyntheticDotPreviewProps {
  zones: CvZonePolygon[];
  /** Initial dot position in 0-1 world coords. */
  initial?: [number, number];
}

export default function ZoneSyntheticDotPreview({
  zones,
  initial = [0.5, 0.5],
}: ZoneSyntheticDotPreviewProps) {
  const [dot, setDot] = useState<[number, number]>(initial);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef(false);
  const matched = findZone(dot[0], dot[1], zones);

  function worldFromEvent(clientX: number, clientY: number): [number, number] | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return [
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    ];
  }

  useEffect(() => {
    function up() {
      dragRef.current = false;
    }
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Synthetic dot preview
        </p>
        <p
          className="text-xs"
          aria-live="polite"
          data-testid="synthetic-dot-status"
        >
          {matched ? (
            <>
              In zone:{" "}
              <span className="font-mono font-medium text-foreground">
                {matched}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              No zone match (player would be Unzoned)
            </span>
          )}
        </p>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full aspect-square rounded bg-muted/20 cursor-grab"
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          const pt = worldFromEvent(e.clientX, e.clientY);
          if (pt) setDot(pt);
        }}
      >
        {zones.map((z) => (
          <polygon
            key={z.slug}
            points={z.points.map((p) => `${p[0] * 100},${p[1] * 100}`).join(" ")}
            fill={z.slug === matched ? "#3b82f6" : "transparent"}
            fillOpacity={0.35}
            stroke="#94a3b8"
            strokeWidth={0.3}
          />
        ))}
        <circle
          cx={dot[0] * 100}
          cy={dot[1] * 100}
          r={1.5}
          className="fill-orange-500 stroke-white"
          strokeWidth={0.5}
          onPointerDown={(e) => {
            dragRef.current = true;
            (e.target as Element).setPointerCapture(e.pointerId);
          }}
          style={{ touchAction: "none" }}
        />
      </svg>
      <p className="text-[11px] text-muted-foreground mt-1">
        Drag the orange dot to test your polygons. Matches the same
        point-in-polygon logic as the live pipeline.
      </p>
    </div>
  );
}
