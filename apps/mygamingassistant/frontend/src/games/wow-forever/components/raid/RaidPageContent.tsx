import RaidClassColumns from "@/games/wow-forever/components/raid/RaidClassColumns";
import RaidCredits from "@/games/wow-forever/components/raid/RaidCredits";
import RaidDescription from "@/games/wow-forever/components/raid/RaidDescription";
import RaidHeader from "@/games/wow-forever/components/raid/RaidHeader";
import RaidPageMeta from "@/games/wow-forever/components/raid/RaidPageMeta";
import RaidRoleSummary from "@/games/wow-forever/components/raid/RaidRoleSummary";
import RaidStatusLists from "@/games/wow-forever/components/raid/RaidStatusLists";
import RaidUpdatedBar from "@/games/wow-forever/components/raid/RaidUpdatedBar";
import { RAID_MAIN_CLASS, RAID_SECTION_HEADING_CLASS } from "@/games/wow-forever/data/raidPage";
import type { RaidPageProblem } from "@/games/wow-forever/lib/raidPageError";
import type { RaidPage } from "@/games/wow-forever/types/raid";

interface RaidPageContentProps {
  page: RaidPage;
  now: number;
  /** When the raid was last read; undefined before the first read lands. */
  fetchedAt: number | undefined;
  isFetching: boolean;
  /** Why the last re-read failed, while what's shown is from before it. */
  refreshProblem: RaidPageProblem | null;
  onRefresh: () => void;
}

/** The raid as its Discord post shows it: header, description, role row, columns, then the lists. */
export default function RaidPageContent({
  page,
  now,
  fetchedAt,
  isFetching,
  refreshProblem,
  onRefresh,
}: RaidPageContentProps) {
  return (
    <main className={RAID_MAIN_CLASS}>
      <RaidPageMeta title={page.title} />
      <RaidHeader page={page} now={now} />
      <RaidDescription segments={page.description} now={now} />
      <section aria-labelledby="raid-signups" className="space-y-3">
        <h2 id="raid-signups" className={RAID_SECTION_HEADING_CLASS}>
          Sign-ups
        </h2>
        <RaidRoleSummary roles={page.roles} iconsVersion={page.icons_version} />
        <RaidClassColumns columns={page.columns} iconsVersion={page.icons_version} discordUrl={page.discord_url} />
      </section>
      <RaidStatusLists lists={page.lists} iconsVersion={page.icons_version} />
      <footer className="space-y-2 border-t pt-4">
        <RaidUpdatedBar
          fetchedAt={fetchedAt}
          now={now}
          isFetching={isFetching}
          problem={refreshProblem}
          onRefresh={onRefresh}
        />
        <RaidCredits />
      </footer>
    </main>
  );
}
