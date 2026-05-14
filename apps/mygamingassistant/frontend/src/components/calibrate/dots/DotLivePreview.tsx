/**
 * DotLivePreview — most-recent `cv:debug-frame` overlaid with blob bboxes.
 *
 * Shown in the Dots panel's right column. Subscribers are reference-counted
 * in the Rust pipeline — the parent's `useCvDebugFrame` hook handles the
 * subscribe/unsubscribe dance.
 *
 * Renders blob bounding boxes as white outlines + numeric labels (`#1`, `#2`)
 * per the accessibility spec — color alone shouldn't carry information.
 */
import { useEffect, useState } from "react";
import { Card, AlertBox } from "@platform/ui";
import type { CvDebugFrameEvent } from "@/types/desktop";

interface DotLivePreviewProps {
  /** Latest debug frame, or null if none received yet. */
  frame: CvDebugFrameEvent | null;
  ready: boolean;
  /** True when the CV pipeline is currently running. */
  pipelineRunning: boolean;
  /** Seconds since last frame; -1 if no frames yet. */
  secondsSinceLast: number;
  /** Triggered when the operator clicks "Start pipeline" inside an empty state. */
  onStartPipeline: () => void | Promise<void>;
}

export default function DotLivePreview({
  frame,
  ready,
  pipelineRunning,
  secondsSinceLast,
  onStartPipeline,
}: DotLivePreviewProps) {
  // Stalled detection: pipeline says running, but no frames for >5s.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(pipelineRunning && secondsSinceLast >= 0 && secondsSinceLast > 5);
  }, [pipelineRunning, secondsSinceLast]);

  if (!ready) {
    return (
      <Card title="Live preview">
        <p className="text-sm text-muted-foreground">Waiting for first frame…</p>
      </Card>
    );
  }

  if (!pipelineRunning) {
    return (
      <Card title="Live preview">
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Start the CV pipeline to see live detections.</p>
          <button
            type="button"
            onClick={() => void onStartPipeline()}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted/40"
          >
            Start pipeline
          </button>
        </div>
      </Card>
    );
  }

  if (!frame) {
    return (
      <Card title="Live preview">
        <p className="text-sm text-muted-foreground">
          Waiting for first frame…{" "}
          {stalled && (
            <AlertBox variant="warning">
              No frames received — pipeline may be stalled. Restart from Setup?
            </AlertBox>
          )}
        </p>
      </Card>
    );
  }

  const largestArea = frame.blobs.reduce((m, b) => Math.max(m, b.area), 0);

  return (
    <Card title="Live preview">
      <div className="space-y-2">
        <div className="flex items-baseline gap-2 text-xs">
          <Chip>Blobs found: {frame.blobs.length}</Chip>
          <Chip>Largest: {largestArea} px²</Chip>
          <Chip>
            Last update:{" "}
            {secondsSinceLast < 0
              ? "…"
              : secondsSinceLast === 0
                ? "just now"
                : `${secondsSinceLast}s ago`}
          </Chip>
        </div>

        <div
          className="relative inline-block max-w-full rounded-md overflow-hidden border bg-muted/20"
          aria-label="Live minimap preview with detected blobs"
        >
          <img
            src={`data:image/png;base64,${frame.png_base64}`}
            alt="Live minimap capture"
            className="block max-w-full"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute inset-0 w-full h-full pointer-events-none"
            // viewBox matches the underlying image — blobs use raw pixel coords.
            viewBox={`0 0 ${imgIntrinsicWidth(frame)} ${imgIntrinsicHeight(frame)}`}
            preserveAspectRatio="none"
          >
            {frame.blobs.map((b, i) => (
              <g key={i}>
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={1}
                />
                <text
                  x={b.x + 2}
                  y={Math.max(0, b.y - 1)}
                  fontSize={Math.max(8, Math.min(12, b.h * 0.6))}
                  fill="#fff"
                  className="select-none"
                >
                  #{i + 1}
                </text>
              </g>
            ))}
            {frame.dot_match && (
              <circle
                cx={frame.dot_match.x}
                cy={frame.dot_match.y}
                r={3}
                fill="none"
                stroke="#fde047"
                strokeWidth={1}
              />
            )}
          </svg>
        </div>

        {stalled && (
          <AlertBox variant="warning">
            No frames received — pipeline may be stalled. Restart from Setup?
          </AlertBox>
        )}
      </div>
    </Card>
  );
}

interface ChipProps {
  children: React.ReactNode;
}

function Chip({ children }: ChipProps) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/40 text-[11px] font-medium">
      {children}
    </span>
  );
}

// We don't know the intrinsic image dimensions before render; we approximate
// via the blob coordinates' max extent. Falls back to 300 when no blobs
// (image is shown but no overlay needed).
function imgIntrinsicWidth(frame: CvDebugFrameEvent): number {
  if (frame.blobs.length === 0) return 300;
  return Math.max(...frame.blobs.map((b) => b.x + b.w), 300);
}

function imgIntrinsicHeight(frame: CvDebugFrameEvent): number {
  if (frame.blobs.length === 0) return 300;
  return Math.max(...frame.blobs.map((b) => b.y + b.h), 300);
}
