/**
 * DotAreaRange — dual-handle area slider (min/max in px²).
 *
 * Two interlocked range inputs, presented vertically so they don't fight
 * each other on touch devices. Includes a small visual aid: two scaled-up
 * squares showing the min/max area at canvas-coords scale.
 */
interface DotAreaRangeProps {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}

const HARD_MIN = 1;
const HARD_MAX = 200;

export default function DotAreaRange({ min, max, onChange }: DotAreaRangeProps) {
  function updateMin(raw: string) {
    let v = Math.max(HARD_MIN, Math.min(HARD_MAX, parseInt(raw, 10) || HARD_MIN));
    if (v > max) v = max;
    onChange(v, max);
  }
  function updateMax(raw: string) {
    let v = Math.max(HARD_MIN, Math.min(HARD_MAX, parseInt(raw, 10) || HARD_MAX));
    if (v < min) v = min;
    onChange(min, v);
  }

  // Visual aid — scale the squares so the max fits inside a ~48px box.
  const visualScale = 48 / Math.sqrt(HARD_MAX);
  const minSidePx = Math.max(2, Math.sqrt(min) * visualScale);
  const maxSidePx = Math.max(2, Math.sqrt(max) * visualScale);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Blob area filter (px²)</p>
      <p className="text-[11px] text-muted-foreground">
        Discard candidate blobs whose pixel area is outside this range. Real
        player dots are usually 8-40 px²; lower bound rejects single-pixel
        speckle, upper bound rejects large UI elements that share color.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="dot-area-min" className="text-xs text-muted-foreground">
            Min: <span className="font-mono">{min}</span>
          </label>
          <input
            id="dot-area-min"
            type="range"
            min={HARD_MIN}
            max={HARD_MAX}
            value={min}
            onChange={(e) => updateMin(e.target.value)}
            aria-valuetext={`Min area ${min}`}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="dot-area-max" className="text-xs text-muted-foreground">
            Max: <span className="font-mono">{max}</span>
          </label>
          <input
            id="dot-area-max"
            type="range"
            min={HARD_MIN}
            max={HARD_MAX}
            value={max}
            onChange={(e) => updateMax(e.target.value)}
            aria-valuetext={`Max area ${max}`}
            className="w-full"
          />
        </div>
      </div>
      <div
        className="flex items-end gap-3 bg-muted/30 rounded-md p-2"
        aria-hidden
      >
        <span className="text-xs text-muted-foreground">min</span>
        <div
          className="bg-blue-500 rounded-sm"
          style={{ width: `${minSidePx}px`, height: `${minSidePx}px` }}
        />
        <span className="text-xs text-muted-foreground ml-2">max</span>
        <div
          className="bg-blue-400 rounded-sm"
          style={{ width: `${maxSidePx}px`, height: `${maxSidePx}px` }}
        />
      </div>
    </div>
  );
}
