import { CHANGE_INDEX } from "@/games/wow-forever/data/changes/changeFiles";

/** Which two clients are compared, and what the feed doesn't cover, with the numbers left out. */
export default function ChangeFeedNote() {
  const { build, classicBuild, gaps, questsSeenOn } = CHANGE_INDEX;
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="change-feed-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">How this list is made</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          Every row is worked out by comparing the WoW Forever game files (build {build}) with the Classic Era game files
          (build {classicBuild}). Nothing here is written by hand. Talent and spell numbers on the Classic side are filled
          from Classic 1.12 data.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Items: only name, quality, item level, required level, armor, weapon damage and speed, and the main stats are
            compared. Effects like hit or spell power aren't.
            {gaps.itemsUnlisted > 0
              ? ` ${gaps.itemsUnlisted.toLocaleString()} other new items (quest items, trade goods and the like) aren't listed.`
              : ""}
          </li>
          <li>
            Class spells: trainer spells only.
            {gaps.spellsIncomplete > 0
              ? ` ${gaps.spellsIncomplete.toLocaleString()} spell ranks have a value the game files don't fill in, so they can't be compared.`
              : ""}
          </li>
          <li>
            Quests: only new quests named by the game client, seen on {questsSeenOn}.
            {gaps.questsUnnamed > 0
              ? ` ${gaps.questsUnnamed.toLocaleString()} more new quests have no name yet and aren't listed.`
              : ""}
          </li>
          <li>Server-side changes (drops, vendors, spawns) aren't in the game files, so they aren't here.</li>
        </ul>
      </div>
    </details>
  );
}
