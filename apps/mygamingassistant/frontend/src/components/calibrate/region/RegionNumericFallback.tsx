/**
 * RegionNumericFallback — manual x/y/w/h inputs.
 *
 * Backup for operators who can't click reliably (e.g., touchpad on a remote
 * desktop session). Same shape as `RegionCornerPicker`, but four numeric
 * inputs feeding the same `CvCaptureRegion` shape.
 */
import type { CvCaptureRegion } from "@/types/desktop";

interface RegionNumericFallbackProps {
  region: CvCaptureRegion;
  onChange: (region: CvCaptureRegion) => void;
  /** Detected resolution — used to validate inputs stay in bounds. */
  maxWidth: number;
  maxHeight: number;
}

export default function RegionNumericFallback({
  region,
  onChange,
  maxWidth,
  maxHeight,
}: RegionNumericFallbackProps) {
  function update(field: keyof CvCaptureRegion, raw: string) {
    const value = Math.max(0, Number.parseInt(raw, 10) || 0);
    const next: CvCaptureRegion = { ...region, [field]: value };
    // Clamp x+width ≤ maxWidth, y+height ≤ maxHeight.
    if (next.x + next.width > maxWidth) {
      if (field === "x") {
        next.x = Math.max(0, maxWidth - next.width);
      } else {
        next.width = Math.max(0, maxWidth - next.x);
      }
    }
    if (next.y + next.height > maxHeight) {
      if (field === "y") {
        next.y = Math.max(0, maxHeight - next.height);
      } else {
        next.height = Math.max(0, maxHeight - next.y);
      }
    }
    onChange(next);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberInput
        id="region-x"
        label="X (screen pixel)"
        value={region.x}
        max={maxWidth}
        onChange={(v) => update("x", v)}
      />
      <NumberInput
        id="region-y"
        label="Y (screen pixel)"
        value={region.y}
        max={maxHeight}
        onChange={(v) => update("y", v)}
      />
      <NumberInput
        id="region-w"
        label="Width"
        value={region.width}
        max={maxWidth}
        onChange={(v) => update("width", v)}
      />
      <NumberInput
        id="region-h"
        label="Height"
        value={region.height}
        max={maxHeight}
        onChange={(v) => update("height", v)}
      />
      <p className="col-span-2 text-xs text-muted-foreground">
        These values are in screen-pixel space. Defaults to the detected
        primary-monitor resolution; clamped so the rect can't extend past the
        screen.
      </p>
    </div>
  );
}

interface NumberInputProps {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: string) => void;
}

function NumberInput({ id, label, value, max, onChange }: NumberInputProps) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded-md border bg-background text-sm min-h-[36px]"
      />
    </div>
  );
}
