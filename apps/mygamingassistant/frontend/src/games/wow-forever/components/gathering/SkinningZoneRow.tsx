import SkinningMobRow from "@/games/wow-forever/components/gathering/SkinningMobRow";
import type { SkinningZone } from "@/games/wow-forever/types/gathering/skinningZone";

/** One zone to skin in: its beasts in your band, each with Directions to its densest pack. */
export default function SkinningZoneRow({ zone }: { zone: SkinningZone }) {
  return (
    <li className="p-3 space-y-1" data-zone={zone.zoneId}>
      <p className="font-semibold">
        {zone.zoneName} <span className="text-sm font-normal text-muted-foreground">· {zone.spawns} beasts in your range</span>
      </p>
      <ul className="space-y-1" aria-label={`Beasts in ${zone.zoneName}`}>
        {zone.mobs.map((mob) => (
          <SkinningMobRow key={mob.name} mob={mob} />
        ))}
      </ul>
    </li>
  );
}
