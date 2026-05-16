/**
 * UnplaceableLineupsNotice — non-blocking hint shown on MapPage when every
 * lineup for the current filter lacks a resolvable map position (no explicit
 * anchor AND the referenced zone has no polygon to take a centroid from).
 *
 * The notice never blocks interaction — the results panel still lists the
 * lineups; only the map pin is unavailable. It points the operator at the
 * Review queue / zone editor to calibrate the affected zones.
 */
import { AlertTriangle } from "lucide-react";

interface UnplaceableLineupsNoticeProps {
  count: number;
}

export default function UnplaceableLineupsNotice({
  count,
}: UnplaceableLineupsNoticeProps) {
  const plural = count !== 1 ? "s" : "";
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border bg-amber-500/10 border-amber-500/30 text-sm"
      role="status"
    >
      <AlertTriangle
        className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex-1">
        <p className="font-medium">
          {count} lineup{plural} can't be shown on the map yet
        </p>
        <p className="text-xs text-muted-foreground">
          These zones need calibration — open the lineups in Review or the
          zone editor to set their map position.
        </p>
      </div>
    </div>
  );
}
