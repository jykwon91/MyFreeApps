import { useState } from "react";
import { Package } from "lucide-react";
import { usePins } from "@/hooks/usePins";
import { usePinAllLineupPackageMutation } from "@/store/lineupPackagesApi";
import type { LineupPackage } from "@/types/game";

export interface PackagesDropdownProps {
  packages: LineupPackage[];
  pins: ReturnType<typeof usePins>;
  pinAllPackage: ReturnType<typeof usePinAllLineupPackageMutation>[0];
  onPinAllComplete: (count: number) => void;
}

export default function PackagesDropdown({
  packages,
  pins,
  pinAllPackage,
  onPinAllComplete,
}: PackagesDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handlePinAll(pkg: LineupPackage) {
    setLoading(pkg.id);
    try {
      const result = await pinAllPackage(pkg.id).unwrap();
      for (const id of result.lineup_ids) {
        pins.pin(id);
      }
      onPinAllComplete(result.lineup_ids.length);
    } catch {
      // Error silently falls through — user sees no pin
    } finally {
      setLoading(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
        title="Apply a lineup package"
        aria-expanded={open}
      >
        <Package className="w-3.5 h-3.5" aria-hidden />
        Packages
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-20 bg-card border rounded-lg shadow-lg p-2 min-w-[220px]">
            <p className="text-xs font-medium text-muted-foreground px-2 pb-1">
              Pin all and enter round mode
            </p>
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => handlePinAll(pkg)}
                disabled={loading === pkg.id}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted/40 flex items-center justify-between gap-2 disabled:opacity-60"
              >
                <span className="truncate">{pkg.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {loading === pkg.id ? "Pinning…" : `${pkg.lineup_ids.length} lineups`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
