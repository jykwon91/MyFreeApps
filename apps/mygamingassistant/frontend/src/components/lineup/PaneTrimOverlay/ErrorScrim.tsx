import { RotateCcw } from "lucide-react";
import type { TrimmablePane } from "@/hooks/usePaneTrim";

interface ErrorScrimProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
  pane: TrimmablePane;
}

export default function ErrorScrim({ message, onRetry, onClose, pane }: ErrorScrimProps) {
  return (
    <div
      role="alert"
      className="absolute inset-0 z-10 bg-black/70 flex flex-col items-center justify-center gap-1.5 px-2 text-center"
    >
      <span className="text-xs font-semibold text-red-400 leading-tight">
        {message}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          aria-label={`Retry trim on ${pane} clip`}
          className="inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
        >
          <RotateCcw className="w-3 h-3" aria-hidden />
          Retry
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel trim"
          className="text-[11px] text-white/60 hover:text-white/80 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
