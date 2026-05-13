/**
 * DotColorSwatch — 96×96 color preview + hex input + RGB sliders + "pick from screen".
 *
 * Two-way bound: changes to the swatch update the hex + sliders, and vice
 * versa. Hex parse failures keep the previous value (no flicker).
 */
import { useState, useEffect } from "react";
import { LoadingButton } from "@platform/ui";
import { hexToRgb, rgbToHex } from "@/lib/calibration";

interface DotColorSwatchProps {
  rgb: [number, number, number];
  onChange: (rgb: [number, number, number]) => void;
  /** Trigger the "pick from screen" capture flow (handled by parent). */
  onPickFromScreen: () => void | Promise<void>;
  /** True while the parent's "pick from screen" capture is in flight. */
  isPicking: boolean;
}

export default function DotColorSwatch({
  rgb,
  onChange,
  onPickFromScreen,
  isPicking,
}: DotColorSwatchProps) {
  const [hexInput, setHexInput] = useState(rgbToHex(rgb));

  // Keep hex input in sync with external rgb changes (e.g. slider drag).
  useEffect(() => {
    setHexInput(rgbToHex(rgb));
  }, [rgb]);

  function applyHex(value: string) {
    setHexInput(value);
    const parsed = hexToRgb(value);
    if (parsed) onChange(parsed);
  }

  function setChannel(idx: 0 | 1 | 2, raw: string) {
    const v = Math.max(0, Math.min(255, parseInt(raw, 10) || 0));
    const next: [number, number, number] = [...rgb];
    next[idx] = v;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="w-24 h-24 rounded-md border-2 border-white shadow"
          style={{ backgroundColor: rgbToHex(rgb) }}
          aria-label={`Current dot color: ${rgbToHex(rgb)}`}
          role="img"
        />
        <div className="flex-1 space-y-2">
          <label htmlFor="dot-hex-input" className="text-xs text-muted-foreground block">
            Hex color
          </label>
          <input
            id="dot-hex-input"
            type="text"
            value={hexInput}
            onChange={(e) => applyHex(e.target.value)}
            className="w-full px-2 py-1 rounded-md border bg-background text-sm font-mono min-h-[36px]"
            placeholder="#ffff00"
          />
          <LoadingButton
            isLoading={isPicking}
            loadingText="Capturing..."
            size="sm"
            onClick={() => void onPickFromScreen()}
          >
            Pick from screen
          </LoadingButton>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs text-muted-foreground mb-1">
          RGB channels
        </legend>
        <ChannelSlider label="R" value={rgb[0]} onChange={(v) => setChannel(0, v)} />
        <ChannelSlider label="G" value={rgb[1]} onChange={(v) => setChannel(1, v)} />
        <ChannelSlider label="B" value={rgb[2]} onChange={(v) => setChannel(2, v)} />
      </fieldset>
    </div>
  );
}

interface ChannelSliderProps {
  label: string;
  value: number;
  onChange: (raw: string) => void;
}

function ChannelSlider({ label, value, onChange }: ChannelSliderProps) {
  const id = `dot-channel-${label.toLowerCase()}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-4 text-xs font-mono text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-valuetext={`${label}: ${value}`}
        className="flex-1"
      />
      <input
        type="number"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 px-2 py-1 rounded-md border bg-background text-xs font-mono"
        aria-label={`${label} channel numeric value`}
      />
    </div>
  );
}
