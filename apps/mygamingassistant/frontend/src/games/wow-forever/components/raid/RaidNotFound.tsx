import { Link } from "react-router-dom";
import RaidPageMeta from "@/games/wow-forever/components/raid/RaidPageMeta";
import { RAID_BUTTON_CLASS, RAID_MAIN_CLASS, WOW_FOREVER_HOME } from "@/games/wow-forever/data/raidPage";
import { NOT_FOUND_MESSAGE } from "@/games/wow-forever/lib/raidPageError";

/** No raid at this link — mistyped, deleted, or never posted — and the way back to WoW Forever. */
export default function RaidNotFound() {
  return (
    <main className={RAID_MAIN_CLASS}>
      <RaidPageMeta title="Raid not found" />
      <section aria-labelledby="raid-not-found" className="space-y-3 rounded-xl border bg-card p-6">
        <h1 id="raid-not-found" className="text-xl font-semibold">
          Raid not found
        </h1>
        <p className="text-sm text-muted-foreground">{NOT_FOUND_MESSAGE}</p>
        <Link to={WOW_FOREVER_HOME} className={RAID_BUTTON_CLASS}>
          Go to WoW Forever
        </Link>
      </section>
    </main>
  );
}
