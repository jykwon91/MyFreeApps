/**
 * LiveTopBar — header strip shown on the `/live/cs2` page.
 *
 * PR 10 expanded the layout from PR 9a's [map · side · zone · phase] to:
 *
 *   [ Mirage · CT · B Site · 💣 planted ] [|] [12-8] [|] [$4150 +kit] [phase]
 *
 * The bar collapses gracefully when individual fields aren't available
 * (e.g., score is null in warmup, bomb_state is null pre-plant) — each
 * segment is independently null-safe and the divider rules adapt.
 *
 * Receives all state via props so it stays a dumb presentational component;
 * the parent (LiveCs2) is the only stateful consumer of `useGsiState`.
 *
 * Helpers live in `liveTopBarUtils.ts` so this file exports only React
 * components (keeps fast-refresh happy).
 */
import { Antenna, Lock, Unlock } from "lucide-react";
import type { Cs2UtilitySlug, GsiSide } from "@/types/desktop";
import { CS2_UTILITY_LABELS } from "@/types/desktop";
import type { LiveBarFields } from "@/lib/gsi";
import {
  connectionStateFromProps,
  formatLastEventTime,
  roundPhaseChipClasses,
  formatZone,
} from "@/components/live/liveTopBarUtils";

/**
 * Full set of inputs the bar needs. Split into a typed shape so the
 * component signature stays readable and tests can pass deliberate
 * fixtures.
 */
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
  override: OverrideState;
  /** Toggle the override panel. */
  onOverrideToggle: (enabled: boolean) => void;
  /**
   * Detected zone slug from the CV pipeline (PR 9a). When non-null, the
   * top bar displays it as a fourth segment. When null, the segment is
   * omitted entirely (matches PR 8 layout).
   * Optional so the prop change is non-breaking — older callers don't pass it.
   */
  zoneSlug?: string | null;
  /**
   * Effective utility filter slugs for the lineup query (PR 10). When
   * non-null AND of length 1, displayed as a small badge so the operator
   * can see at a glance what's being narrowed.
   * Optional so the prop change is non-breaking.
   */
  utilityFilter?: readonly string[] | null;
}

/** Override panel state — extracted into a named interface per the
 *  "extract inline anonymous shapes" preference. */
interface OverrideState {
  enabled: boolean;
  mapSlug: string;
  side: GsiSide;
  utility: Cs2UtilitySlug | null;
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
  utilityFilter,
}: LiveTopBarProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-b bg-card/70">
      <ConnectionDot ready={ready} running={running} payloadsReceived={payloadsReceived} />
      <DetectedStateDisplay
        override={override}
        liveBar={liveBar}
        zoneSlug={zoneSlug ?? null}
        utilityFilter={utilityFilter ?? null}
      />

      <OverrideToggle override={override} onToggle={onOverrideToggle} />

      <LastEventTimestamp lastEventAt={lastEventAt} />
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

interface OverrideToggleProps {
  override: OverrideState;
  onToggle: (enabled: boolean) => void;
}

function OverrideToggle({ override, onToggle }: OverrideToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!override.enabled)}
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
          : "Override the auto-detected map/side/utility"
      }
    >
      {override.enabled ? <OverrideOnLabel /> : <OverrideOffLabel />}
    </button>
  );
}

function OverrideOnLabel() {
  return (
    <>
      <Lock className="w-3 h-3" aria-hidden />
      Override on
    </>
  );
}

function OverrideOffLabel() {
  return (
    <>
      <Unlock className="w-3 h-3" aria-hidden />
      Override
    </>
  );
}

interface DetectedStateDisplayProps {
  override: OverrideState;
  liveBar: LiveBarFields | null;
  /** Detected zone from CV pipeline. Null = omitted. */
  zoneSlug: string | null;
  /** Active utility filter being applied to the lineup query. */
  utilityFilter: readonly string[] | null;
}

function DetectedStateDisplay({
  override,
  liveBar,
  zoneSlug,
  utilityFilter,
}: DetectedStateDisplayProps) {
  if (override.enabled) {
    return <OverrideStateLine override={override} />;
  }
  if (!liveBar) {
    return (
      <span className="text-sm text-muted-foreground">
        Waiting for CS2…
      </span>
    );
  }
  return (
    <LiveStateLine
      liveBar={liveBar}
      zoneSlug={zoneSlug}
      utilityFilter={utilityFilter}
    />
  );
}

function OverrideStateLine({ override }: { override: OverrideState }) {
  const sideLabel =
    override.side === "any"
      ? "Any"
      : override.side === "side_a"
        ? "T"
        : "CT";
  const utilityLabel = override.utility
    ? CS2_UTILITY_LABELS[override.utility]
    : null;
  return (
    <span className="text-sm font-medium">
      {override.mapSlug || "—"}
      <Divider />
      {sideLabel}
      {utilityLabel && (
        <>
          <Divider />
          <span data-testid="live-utility">{utilityLabel}</span>
        </>
      )}
      <span className="text-muted-foreground ml-2 text-xs">(override)</span>
    </span>
  );
}

interface LiveStateLineProps {
  liveBar: LiveBarFields;
  zoneSlug: string | null;
  utilityFilter: readonly string[] | null;
}

function LiveStateLine({ liveBar, zoneSlug, utilityFilter }: LiveStateLineProps) {
  const zoneText = formatZone(zoneSlug);
  const utilityBadgeText = utilityBadgeFromFilter(utilityFilter);

  return (
    <span className="text-sm font-medium flex items-baseline flex-wrap gap-x-1">
      <span>{liveBar.mapDisplay}</span>
      <Divider />
      <span>{liveBar.sideDisplay}</span>
      {zoneText && (
        <>
          <Divider />
          <span data-testid="live-zone">{zoneText}</span>
        </>
      )}
      {utilityBadgeText && (
        <>
          <Divider />
          <span data-testid="live-utility" className="px-1.5 py-0.5 text-xs rounded bg-muted/50">
            {utilityBadgeText}
          </span>
        </>
      )}
      {liveBar.bombDisplay && (
        <>
          <Divider />
          <span data-testid="live-bomb" className="text-orange-500 dark:text-orange-400">
            {liveBar.bombDisplay}
          </span>
        </>
      )}
      <SectionSeparator />
      {liveBar.scoreDisplay && (
        <>
          <span data-testid="live-score" className="text-muted-foreground">
            {liveBar.scoreDisplay}
          </span>
          <SectionSeparator />
        </>
      )}
      {liveBar.moneyDisplay && (
        <>
          <span data-testid="live-money" className="text-muted-foreground">
            {liveBar.moneyDisplay}
            {liveBar.equipExtra && (
              <span className="ml-0.5 text-xs opacity-80">{liveBar.equipExtra}</span>
            )}
          </span>
          <SectionSeparator />
        </>
      )}
      {liveBar.roundPhaseDisplay && (
        <span
          data-testid="live-round-phase"
          className={[
            "px-1.5 py-0.5 text-xs rounded",
            roundPhaseChipClasses(liveBar.roundPhaseDisplay),
          ].join(" ")}
        >
          {liveBar.roundPhaseDisplay}
        </span>
      )}
    </span>
  );
}

function Divider() {
  return <span className="text-muted-foreground mx-1">·</span>;
}

function SectionSeparator() {
  return <span className="text-muted-foreground/60 mx-1.5">|</span>;
}

function LastEventTimestamp({ lastEventAt }: { lastEventAt: string | undefined }) {
  if (!lastEventAt) return null;
  return (
    <span className="text-xs text-muted-foreground hidden sm:inline">
      Last: {formatLastEventTime(lastEventAt)}
    </span>
  );
}

/**
 * Format the utility filter as a short badge text.
 *
 * - `null` or empty → `null` (no badge)
 * - one slug → readable label ("Smoke")
 * - multiple slugs → "Smoke +1" (avoids exploding the bar with full lists)
 *
 * Extracted from the component body so it's unit-testable in isolation.
 */
function utilityBadgeFromFilter(
  filter: readonly string[] | null,
): string | null {
  if (!filter || filter.length === 0) return null;
  const firstSlug = filter[0] as Cs2UtilitySlug;
  const firstLabel = CS2_UTILITY_LABELS[firstSlug] ?? filter[0];
  if (filter.length === 1) return firstLabel;
  return `${firstLabel} +${filter.length - 1}`;
}
