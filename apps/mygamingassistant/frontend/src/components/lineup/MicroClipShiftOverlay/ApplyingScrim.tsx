import type { ShiftablePane } from "@/hooks/usePaneWindowShift";

interface ApplyingScrimProps {
  pane: ShiftablePane;
}

export default function ApplyingScrim({ pane }: ApplyingScrimProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Shifting ${pane} clip, please wait`}
      className="absolute inset-0 z-10 bg-black/50 flex flex-col justify-end"
    >
      <div className="relative h-0.5 bg-white/20 w-full overflow-hidden">
        <div className="absolute h-full w-1/3 bg-white animate-[shimmer_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
