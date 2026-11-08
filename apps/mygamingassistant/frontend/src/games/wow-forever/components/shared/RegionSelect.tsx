import { WOW_REGIONS, parseWowRegion } from "@/games/wow-forever/data/wowRegions";
import { useWowRegion } from "@/games/wow-forever/hooks/useWowRegion";

/** The server status region. It's saved and shared, so every status section follows the change. */
export default function RegionSelect({ className = "" }: { className?: string }) {
  const [region, setRegion] = useWowRegion();
  return (
    <select
      aria-label="Region"
      value={region}
      onChange={(e) => {
        const next = parseWowRegion(e.target.value);
        if (next) setRegion(next);
      }}
      className={`text-sm rounded-md border bg-card px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] sm:min-h-0 ${className}`}
    >
      {WOW_REGIONS.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
