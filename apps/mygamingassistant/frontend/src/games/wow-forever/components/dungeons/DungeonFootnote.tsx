/** Where each part of the dungeon pages comes from, and what isn't listed. */
export default function DungeonFootnote({ clientBuild }: { clientBuild: string }) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground">
      <p>
        The recommended level, the group size, the bosses in order and the flight paths are read from the WoW
        Forever client (build {clientBuild}). The lowest level the door lets you in at, entrances, keys, what each
        boss drops and the drop chances are Classic data (cmangos classic-db), and only items the Forever client has
        are listed. Flight-path distances are straight lines, not the walk.
      </p>
      <p>Raids and Forever's new dungeons aren't listed yet; recipes, reagents and quest items aren't in the drop lists.</p>
    </aside>
  );
}
