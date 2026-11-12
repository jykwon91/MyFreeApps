import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";

/** The last roster refresh failed: the list below is from the refresh before it. */
export default function GuildRefreshNotice({ rosterUpdatedAt }: { rosterUpdatedAt: string | null }) {
  return (
    <p role="status" className="rounded-xl border border-amber-500/40 bg-card p-3 text-sm">
      Blizzard didn&apos;t answer the last roster update
      {rosterUpdatedAt ? `, so this list is from ${relativeTime(rosterUpdatedAt)}` : ""}. We&apos;ll try again soon.
    </p>
  );
}
