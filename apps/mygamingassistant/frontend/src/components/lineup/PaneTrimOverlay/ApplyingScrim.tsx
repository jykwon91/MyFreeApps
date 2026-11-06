import type { TrimmablePane } from "@/hooks/usePaneTrim";

interface ApplyingScrimProps {
  pane: TrimmablePane;
}

export default function ApplyingScrim({ pane }: ApplyingScrimProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Trimming ${pane} clip, please wait`}
      className="absolute inset-0 z-10 bg-black/50 flex flex-col justify-end"
    >
      {/* Indeterminate shimmer bar at the bottom edge. ffmpeg doesn't
          stream progress, so animate width-cycling rather than fake-precise
          progress. */}
      <div className="relative h-0.5 bg-white/20 w-full overflow-hidden">
        <div className="absolute h-full w-1/3 bg-white animate-[shimmer_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
