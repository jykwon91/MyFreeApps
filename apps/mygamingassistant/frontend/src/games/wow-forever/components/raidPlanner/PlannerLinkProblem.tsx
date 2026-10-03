import { KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import RaidPageMeta from "@/games/wow-forever/components/raid/RaidPageMeta";
import { RAID_BUTTON_CLASS, RAID_MAIN_CLASS, WOW_FOREVER_HOME } from "@/games/wow-forever/data/raidPage";
import { PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";

const TITLE = "Planner link missing or expired";

/** No working planner link in this tab — none, mistyped, expired, or replaced by a newer one — and how to get one. */
export default function PlannerLinkProblem() {
  return (
    <main className={RAID_MAIN_CLASS}>
      <RaidPageMeta title={TITLE} />
      <section aria-labelledby="planner-link-problem" className="space-y-3 rounded-xl border bg-card p-6">
        <KeyRound aria-hidden className="h-6 w-6 text-muted-foreground" />
        <h1 id="planner-link-problem" className="text-xl font-semibold">
          {TITLE}
        </h1>
        <p className="text-sm text-muted-foreground">{PLANNER_MESSAGE.LINK_PROBLEM}</p>
        <Link to={WOW_FOREVER_HOME} className={RAID_BUTTON_CLASS}>
          Go to WoW Forever
        </Link>
      </section>
    </main>
  );
}
