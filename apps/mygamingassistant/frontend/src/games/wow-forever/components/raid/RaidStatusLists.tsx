import RaidColumnCard from "@/games/wow-forever/components/raid/RaidColumnCard";
import { RAID_SECTION_HEADING_CLASS } from "@/games/wow-forever/data/raidPage";
import type { RaidStatusList } from "@/games/wow-forever/types/raid";

interface RaidStatusListsProps {
  lists: RaidStatusList[];
  iconsVersion: string;
}

/** Tentative, Bench and Absence — whichever have anyone on them; off the line, so unnumbered. */
export default function RaidStatusLists({ lists, iconsVersion }: RaidStatusListsProps) {
  if (lists.length === 0) return null;
  return (
    <section aria-labelledby="raid-lists" className="space-y-3">
      <h2 id="raid-lists" className={RAID_SECTION_HEADING_CLASS}>
        {lists.map((list) => list.label).join(" · ")}
      </h2>
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <RaidColumnCard
            key={list.status}
            heading={list.label}
            icon={list.icon}
            count={String(list.entries.length)}
            entries={list.entries}
            iconsVersion={iconsVersion}
            numbered={false}
          />
        ))}
      </div>
    </section>
  );
}
