/**
 * LiveTopBar — header strip shown on the `/live/cs2` page.
 *
 * Layout (single row, fixed height):
 *   [ Mirage · CT · Live ] [override toggle] [conn status]
 *
 * Receives all state via props so it stays a dumb presentational component;
 * the parent (LiveCs2) is the only stateful consumer of `useGsiState`.
 *
 * Helpers live in `liveTopBarUtils.ts` so this file exports only React
 * components (keeps fast-refresh happy).
 */
import { Antenna, Lock, Unlock } from "lucide-react";
import type { GsiSide } from "@/types/desktop";
import type { LiveBarFields } from "@/lib/gsi";
import {
  connectionStateFromProps,
  formatLastEventTime,
} from "@/components/live/liveTopBarUtils";

interface LiveTopBarProps {
  /** True once `useGsiState` has finished its initial subscribe + bootstrap. */
  ready: boolean;
  /** True when the HTTP receiver is bound and listening. */
  running: boolean;
  /** Cumulative count of accepted GSI payloads since receiver start. */
  payloadsReceived: number;
  /** RFC3339 timestamp of the most recent accepted GSI payload. */
  lastEventAt: string | undefined;
  /** Summarized GSI fields for display, or `null` if no event yet. */
  liveBar: LiveBarFields | null;
  /** Override panel state. */
  override: { enabled: boolean; mapSlug: string; side: GsiSide };
  /** Toggle the override panel. */
  onOverrideToggle: (enabled: boolean) => void;
  /**
   * Detected zone slug from the CV pipeline (PR 9a). When non-null, the
   * top bar displays it as a fourth segment: "Mirage · CT · B Site · Live".
   * When null, the segment is omitted entirely (matches PR 8 layout).
   * Optional so the prop change is non-breaking — older callers don't pass it.
   */
  zoneSlug?: string | null;
}

export default function LiveTopBar({
  ready,
  running,
  payloadsReceived,
  lastEventAt,
  liveBar,
  override,
  onOverrideToggle,
  zoneSlug,
}: LiveTopBarProps) {
  return (
    <header className="flex items-center gap-3 px-3 py-2 border-b bg-card/70">
      <ConnectionDot ready={ready} running={running} payloadsReceived={payloadsReceived} />
      <DetectedStateDisplay
        override={override}
        liveBar={liveBar}
        zoneSlug={zoneSlug ?? null}
      />

      <button
        type="button"
        onClick={() => onOverrideToggle(!override.enabled)}
        className={[
          "ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors min-h-[28px]",
          override.enabled
            ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400"
            : "bg-card hover:bg-muted/40",
        ].join(" ")}
        aria-pressed={override.enabled}
        title={
          override.enabled
            ? "Manual override active — click to disable and follow CS2 again"
            : "Override the auto-detected map/side"
        }
      >
        {override.enabled ? (
          <>
            <Lock className="w-3 h-3" aria-hidden />
            Override on
          </>
        ) : (
          <>
            <Unlock className="w-3 h-3" aria-hidden />
            Override
          </>
        )}
      </button>

      <LastEventTimestamp lastEventAt={lastEventAt} />
    </header>
  );
}

interface ConnectionDotProps {
  ready: boolean;
  running: boolean;
  payloadsReceived: number;
}

function ConnectionDot({ ready, running, payloadsReceived }: ConnectionDotProps) {
  const { color, label } = connectionStateFromProps(ready, running, payloadsReceived);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      aria-label={`Receiver: ${label}`}
    >
      <Antenna className={`w-3.5 h-3.5 ${color}`} aria-hidden />
      <span className={color}>{label}</span>
    </span>
  );
}

interface DetectedStateDisplayProps {
  override: { enabled: boolean; mapSlug: string; side: GsiSide };
  liveBar: LiveBarFields | null;
  /** Detected zone from CV pipeline. Null = omitted. */
  zoneSlug: string | null;
}

/** Format a zone slug for display. Same shape as `formatZoneDisplay` in
 *  `lib/cv.ts` — duplicated here so the LiveTopBar component file doesn't
 *  have to import from `lib/` (keeps it a pure presentational component). */
function formatZone(slug: string | null): string | null {
  if (!slug) return null;
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetectedStateDisplay({
  override,
  liveBar,
  zoneSlug,
}: DetectedStateDisplayProps) {
  // Zone is only meaningful when we're following live detection. The
  // override flow hides it (the operator is manually picking a map/side).
  const zoneText = !override.enabled ? formatZone(zoneSlug) : null;

  if (override.enabled) {
    return (
      <span className="text-sm font-medium">
        {override.mapSlug || "—"}
        <span className="text-muted-foreground mx-1">·</span>
        {override.side === "any" ? "Any" : override.side === "side_a" ? "T" : "CT"}
        <span className="text-muted-foreground ml-2 text-xs">(override)</span>
      </span>
    );
  }
  if (!liveBar) {
    return (
      <span className="text-sm text-muted-foreground">
        Waiting for CS2…
      </span>
    );
  }
  return (
    <span className="text-sm font-medium">
      {liveBar.mapDisplay}
      <span className="text-muted-foreground mx-1">·</span>
      {liveBar.sideDisplay}
      {zoneText && (
        <>
          <span className="text-muted-foreground mx-1">·</span>
          <span data-testid="live-zone">{zoneText}</span>
        </>
      )}
      <span className="text-muted-foreground mx-1">·</span>
      <span className="text-muted-foreground">{liveBar.phaseDisplay}</span>
    </span>
  );
}

function LastEventTimestamp({ lastEventAt }: { lastEventAt: string | undefined }) {
  if (!lastEventAt) return null;
  return (
    <span className="text-xs text-muted-foreground hidden sm:inline">
      Last: {formatLastEventTime(lastEventAt)}
    </span>
  );
}
