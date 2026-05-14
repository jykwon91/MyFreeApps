/**
 * CalibrateTopBar — map + resolution picker + source badge + reset button.
 *
 * Top of the calibration page. Map dropdown lists every CS2 map; resolution
 * dropdown has a fixed list plus an extra "Detected: WxH" entry when the
 * primary-monitor resolution doesn't match any preset.
 *
 * Changing map or resolution fires the dirty-leave guard at the parent
 * level — this component only emits change events.
 */
import { useMemo } from "react";
import { ArrowLeft, HelpCircle, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, StatusBadge } from "@platform/ui";
import type { CalibrationSource, CvMonitorResolution } from "@/types/desktop";
import UnsavedBadge from "./shared/UnsavedBadge";

/** Fixed list of resolutions presented in the dropdown. */
const STANDARD_RESOLUTIONS = [
  "1920x1080",
  "2560x1440",
  "3840x2160",
  "1366x768",
] as const;

export interface MapOption {
  slug: string;
  name: string;
}

interface CalibrateTopBarProps {
  maps: MapOption[];
  mapSlug: string;
  resolution: string;
  /** Detected primary-monitor resolution (or null when not yet resolved). */
  detectedResolution: CvMonitorResolution | null;
  source: CalibrationSource;
  /** True when ANY section has unsaved edits. Drives the global indicator. */
  hasAnyDirty: boolean;
  onMapChange: (slug: string) => void;
  onResolutionChange: (res: string) => void;
  onResetToBundled: () => void;
  /** Disabled when no override exists OR source is already bundled. */
  resetToBundledDisabled: boolean;
  onShowShortcuts: () => void;
  /** Aria-live status string surfaced to screen readers. */
  liveStatus: string;
}

export default function CalibrateTopBar({
  maps,
  mapSlug,
  resolution,
  detectedResolution,
  source,
  hasAnyDirty,
  onMapChange,
  onResolutionChange,
  onResetToBundled,
  resetToBundledDisabled,
  onShowShortcuts,
  liveStatus,
}: CalibrateTopBarProps) {
  const resolutionOptions = useMemo(() => {
    const stdSet = new Set<string>(STANDARD_RESOLUTIONS);
    const out: Array<{ value: string; label: string }> = STANDARD_RESOLUTIONS.map((r) => ({
      value: r,
      label: r,
    }));
    if (
      detectedResolution &&
      !stdSet.has(`${detectedResolution.width}x${detectedResolution.height}`)
    ) {
      const v = `${detectedResolution.width}x${detectedResolution.height}`;
      out.push({ value: v, label: `Detected: ${v}` });
    }
    if (!stdSet.has(resolution) && resolution !== "" && !out.some((o) => o.value === resolution)) {
      out.push({ value: resolution, label: `Custom: ${resolution}` });
    }
    return out;
  }, [resolution, detectedResolution]);

  return (
    <header className="border-b px-3 py-2 flex flex-wrap items-center gap-3">
      <Link
        to="/live/cs2/setup"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to setup
      </Link>

      <span className="hidden sm:inline text-muted-foreground/60" aria-hidden>
        |
      </span>

      <label
        className="flex items-center gap-2 text-sm"
        htmlFor="calibrate-map-select"
      >
        <span className="text-muted-foreground">Map</span>
        <select
          id="calibrate-map-select"
          value={mapSlug}
          onChange={(e) => onMapChange(e.target.value)}
          className="px-2 py-1 text-sm rounded-md border bg-background min-h-[36px]"
        >
          {maps.length === 0 && <option value="">No maps available</option>}
          {maps.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label
        className="flex items-center gap-2 text-sm"
        htmlFor="calibrate-resolution-select"
      >
        <span className="text-muted-foreground">Resolution</span>
        <select
          id="calibrate-resolution-select"
          value={resolution}
          onChange={(e) => onResolutionChange(e.target.value)}
          className="px-2 py-1 text-sm rounded-md border bg-background min-h-[36px]"
        >
          {resolutionOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <StatusBadge
        tone={source === "override" ? "info" : "neutral"}
        label={source === "override" ? "Custom override" : "Bundled default"}
        data-testid="calibrate-source-badge"
      />

      {hasAnyDirty && <UnsavedBadge label="unsaved changes" />}

      <span className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onResetToBundled}
        disabled={resetToBundledDisabled}
        title="Delete the custom override file and revert to the bundled default."
      >
        <RotateCcw className="w-4 h-4 mr-1" aria-hidden />
        Reset to bundled default
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onShowShortcuts}
        title="Show keyboard shortcuts"
        aria-label="Show keyboard shortcuts"
      >
        <HelpCircle className="w-4 h-4" aria-hidden />
      </Button>

      {/* Single aria-live region for the whole page; debounced 300ms upstream. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="calibrate-live-status"
      >
        {liveStatus}
      </div>
    </header>
  );
}
