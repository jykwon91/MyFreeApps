import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import RaidColumnCard from "@/games/wow-forever/components/raid/RaidColumnCard";
import { RAID_GROUPS_ANCHOR, RAID_SECTION_HEADING_CLASS } from "@/games/wow-forever/data/raidPage";
import { GROUP_SIZE } from "@/games/wow-forever/data/raidPlanner";
import { countLabel } from "@/games/wow-forever/lib/raidLabels";
import { unplacedLabel } from "@/games/wow-forever/lib/raidPlanLabels";
import type { RaidGroups } from "@/games/wow-forever/types/raid";

interface RaidGroupsViewProps {
  groups: RaidGroups;
  iconsVersion: string;
}

/**
 * The leader's groups on the raid page, while they share them: each group's players in seat order, and how many
 * seated players are in none yet. The post's [Groups] reply links here (`#groups`).
 */
export default function RaidGroupsView({ groups, iconsVersion }: RaidGroupsViewProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    // The browser looked for the anchor before the raid loaded: go there now the groups are on the page.
    if (hash === `#${RAID_GROUPS_ANCHOR}`) sectionRef.current?.scrollIntoView({ block: "start" });
  }, [hash]);
  return (
    <section
      ref={sectionRef}
      id={RAID_GROUPS_ANCHOR}
      aria-labelledby="raid-groups"
      className="scroll-mt-4 space-y-3"
    >
      <h2 id="raid-groups" className={RAID_SECTION_HEADING_CLASS}>
        Groups
      </h2>
      {groups.groups.length === 0 && <p className="text-sm text-muted-foreground">Nobody is in a group yet.</p>}
      {groups.groups.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {groups.groups.map((group) => (
            <RaidColumnCard
              key={group.number}
              heading={`Group ${group.number}`}
              icon={null}
              count={countLabel(group.entries.length, GROUP_SIZE)}
              entries={group.entries}
              iconsVersion={iconsVersion}
              numbered
            />
          ))}
        </div>
      )}
      {groups.unplaced > 0 && <p className="text-sm text-muted-foreground">{unplacedLabel(groups.unplaced)}</p>}
    </section>
  );
}
