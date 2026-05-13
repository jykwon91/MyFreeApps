/**
 * CalibrateSideNav — vertical rail with the three calibration sections.
 *
 * Each item shows a status dot:
 *   green   — clean (no edits relative to baseline)
 *   amber   — dirty (unsaved edits)
 *   grey    — untouched (no baseline + no edits — i.e. fresh map)
 *
 * Color is not the only signal — the dirty state also flips an UnsavedBadge
 * for screen-reader users.
 */
import { Crosshair, MapPin, Hexagon } from "lucide-react";
import { cn } from "@platform/ui";
import UnsavedBadge from "./shared/UnsavedBadge";

export type CalibrateSection = "region" | "zones" | "dots";

interface DirtySections {
  region: boolean;
  zones: boolean;
  dots: boolean;
}

interface CalibrateSideNavProps {
  /** Currently-selected section (controlled). */
  active: CalibrateSection;
  /** True when the operator hasn't loaded any baseline yet (no save was done
   *  AND no bundled package exists). Suppresses both green and amber so the
   *  whole rail reads "untouched". */
  hasBaseline: boolean;
  /** Per-section dirty flags from `useCalibrationDraft.dirtySections`. */
  dirty: DirtySections;
  onSelect: (section: CalibrateSection) => void;
}

const ITEMS: Array<{
  key: CalibrateSection;
  label: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  hint: string;
}> = [
  {
    key: "region",
    label: "Region",
    Icon: MapPin,
    hint: "Mark the minimap rectangle on your screen.",
  },
  {
    key: "zones",
    label: "Zones",
    Icon: Hexagon,
    hint: "Draw the polygons (A site, B site, etc.).",
  },
  {
    key: "dots",
    label: "Dots",
    Icon: Crosshair,
    hint: "Tune the player-dot color + tolerance.",
  },
];

export default function CalibrateSideNav({
  active,
  hasBaseline,
  dirty,
  onSelect,
}: CalibrateSideNavProps) {
  return (
    <nav
      className="flex flex-row lg:flex-col gap-1 p-2 border-b lg:border-b-0 lg:border-r min-w-[160px]"
      aria-label="Calibration sections"
    >
      {ITEMS.map((item, idx) => {
        const isActive = active === item.key;
        const isDirty = dirty[item.key];
        const isClean = hasBaseline && !isDirty;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left",
              "transition-colors min-h-[44px]",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-muted/40 text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
            title={`${item.label}: ${item.hint}`}
            data-testid={`calibrate-nav-${item.key}`}
          >
            <span
              className="inline-flex items-center justify-center w-2 h-2 rounded-full shrink-0"
              aria-hidden
            >
              <StatusDot kind={statusKindFor(hasBaseline, isDirty)} />
            </span>
            <item.Icon className="w-4 h-4 shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {isDirty && <UnsavedBadge compact />}
            <span className="sr-only">{`Section ${idx + 1} of ${ITEMS.length}`}</span>
            {isClean && <span className="sr-only">clean</span>}
          </button>
        );
      })}
    </nav>
  );
}

type DotKind = "clean" | "dirty" | "untouched";

function statusKindFor(hasBaseline: boolean, isDirty: boolean): DotKind {
  if (!hasBaseline) return "untouched";
  if (isDirty) return "dirty";
  return "clean";
}

function StatusDot({ kind }: { kind: DotKind }) {
  if (kind === "clean") {
    return (
      <span className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />
    );
  }
  if (kind === "dirty") {
    return (
      <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
    );
  }
  return <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />;
}
