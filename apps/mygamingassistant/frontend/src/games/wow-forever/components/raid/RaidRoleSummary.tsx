import RaidIcon from "@/games/wow-forever/components/raid/RaidIcon";
import { countLabel } from "@/games/wow-forever/lib/raidLabels";
import type { RaidRoleCount } from "@/games/wow-forever/types/raid";

interface RaidRoleSummaryProps {
  roles: RaidRoleCount[];
  iconsVersion: string;
}

/** The role row above the columns ("Tanks 2/2 · Melee 6 · Ranged 4 · Healers 2"), with the post's counts. */
export default function RaidRoleSummary({ roles, iconsVersion }: RaidRoleSummaryProps) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Roles">
      {roles.map((role) => (
        <li key={role.role} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm">
          <RaidIcon name={role.icon} version={iconsVersion} alt="" />
          <span>{role.label}</span>
          <span className="font-semibold tabular-nums">{countLabel(role.count, role.limit)}</span>
        </li>
      ))}
    </ul>
  );
}
