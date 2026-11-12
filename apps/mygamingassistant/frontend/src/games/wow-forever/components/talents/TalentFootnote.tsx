/** Where the talent trees come from. */
export default function TalentFootnote({ apiBuild }: { apiBuild: string }) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground" data-testid="talent-footnote">
      <p>
        The trees, where each talent sits, what it needs and what each rank does are the live game's, read from
        Blizzard's Game Data API (game build {apiBuild}). Icons are the WoW Forever client's.
      </p>
      <p>
        "Changed in Forever" shows what a rank did in Classic (the Classic Era client's wording with cmangos
        classic-db numbers) where Forever's text says something different. "New in Forever" marks a talent Classic
        has nothing like. A sentence Classic's text leaves blank is left out rather than filled in.
      </p>
    </aside>
  );
}
