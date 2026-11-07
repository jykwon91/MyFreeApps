/** Where each part of the dungeon pages comes from, and what isn't listed. */
export default function DungeonFootnote({ clientBuild }: { clientBuild: string }) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground">
      <p>
        Levels and the bosses in order are read from the WoW Forever client (build {clientBuild}). Entrances, what
        each boss drops and the drop chances are Classic data (cmangos classic-db), and only items the Forever client
        has are listed.
      </p>
      <p>Raids and Forever's new dungeons aren't listed yet; recipes, reagents and quest items aren't in the drop lists.</p>
    </aside>
  );
}
