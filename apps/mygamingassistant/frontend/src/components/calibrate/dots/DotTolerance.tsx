/**
 * DotTolerance — single 0-100 slider mapped to 0-255 internally.
 *
 * Operators care about "how forgiving is the match?" not "what's the
 * Euclidean RGB distance?". We surface a 0-100 scale (~percent) and map
 * to the underlying u8 tolerance the Rust side expects.
 */
interface DotToleranceProps {
  /** Internal tolerance in 0-255 (matches Rust shape). */
  tolerance255: number;
  onChange: (tolerance255: number) => void;
}

const MAX_INTERNAL = 255;
const MAX_DISPLAY = 100;

function internalToDisplay(t255: number): number {
  return Math.round((t255 / MAX_INTERNAL) * MAX_DISPLAY);
}

function displayToInternal(t100: number): number {
  return Math.max(0, Math.min(MAX_INTERNAL, Math.round((t100 / MAX_DISPLAY) * MAX_INTERNAL)));
}

export default function DotTolerance({ tolerance255, onChange }: DotToleranceProps) {
  const display = internalToDisplay(tolerance255);

  function handleChange(raw: string) {
    const v = Math.max(0, Math.min(MAX_DISPLAY, parseInt(raw, 10) || 0));
    onChange(displayToInternal(v));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="dot-tolerance-slider"
          className="text-sm font-medium"
          title="How forgiving the color match is. Higher tolerance accepts more pixels as your dot."
        >
          Color tolerance
        </label>
        <span className="text-xs font-mono text-muted-foreground" aria-live="polite">
          {display} / {MAX_DISPLAY}
        </span>
      </div>
      <input
        id="dot-tolerance-slider"
        type="range"
        min={0}
        max={MAX_DISPLAY}
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        aria-valuetext={`Color tolerance ${display} out of ${MAX_DISPLAY}`}
        className="w-full"
      />
      <p className="text-[11px] text-muted-foreground">
        Low values (0-20) accept only near-exact matches. High values (60-100)
        catch dimmer outliers but increase false-positive risk.
      </p>
    </div>
  );
}
