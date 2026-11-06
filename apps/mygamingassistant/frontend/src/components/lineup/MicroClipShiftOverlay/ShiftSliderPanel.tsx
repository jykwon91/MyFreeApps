import { useId } from "react";
import { X } from "lucide-react";
import {
  MICRO_CLIP_DURATION_S,
  type ShiftablePane,
} from "@/hooks/usePaneWindowShift";
import SliderBody from "./SliderBody";
import WidenFirstCTA from "./WidenFirstCTA";

interface ShiftSliderPanelProps {
  offsetS: number;
  sourceDurationS: number;
  widerSourceUrl: string | null;
  onChange: (offset: number) => void;
  onApply: () => void;
  onClose: () => void;
  pane: ShiftablePane;
  isWidening: boolean;
  widenError: string | null;
  onWiden: () => void;
  onDismissWidenError: () => void;
}

export default function ShiftSliderPanel({
  offsetS,
  sourceDurationS,
  widerSourceUrl,
  onChange,
  onApply,
  onClose,
  pane,
  isWidening,
  widenError,
  onWiden,
  onDismissWidenError,
}: ShiftSliderPanelProps) {
  const headerId = useId();
  const hasWiderSource =
    widerSourceUrl != null && sourceDurationS > MICRO_CLIP_DURATION_S;
  const maxOffset = Math.max(0, sourceDurationS - MICRO_CLIP_DURATION_S);

  return (
    <div
      role="dialog"
      aria-labelledby={headerId}
      className="absolute inset-0 z-10 bg-black/70 flex flex-col justify-end p-1.5 gap-1"
    >
      <span id={headerId} className="sr-only">{`Shift ${pane} micro-clip window`}</span>
      {/* Close (top-right) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cancel shift"
        disabled={isWidening}
        className="absolute top-1.5 right-1.5 z-20 p-1 rounded bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <X className="w-3 h-3" aria-hidden />
      </button>

      {hasWiderSource ? (
        <SliderBody
          offsetS={offsetS}
          maxOffset={maxOffset}
          sourceDurationS={sourceDurationS}
          widerSourceUrl={widerSourceUrl}
          onChange={onChange}
          onApply={onApply}
          pane={pane}
          isWidening={isWidening}
          widenError={widenError}
          onWiden={onWiden}
          onDismissError={onDismissWidenError}
        />
      ) : (
        <WidenFirstCTA
          isWidening={isWidening}
          widenError={widenError}
          pane={pane}
          onWiden={onWiden}
          onDismissError={onDismissWidenError}
        />
      )}
    </div>
  );
}
