/** Where the talent trees come from, and what isn't in them yet. */
export default function TalentFootnote({ clientBuild }: { clientBuild: string }) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground" data-testid="talent-footnote">
      <p>
        The trees, where each talent sits, what it needs and what each rank does are read from the WoW Forever client
        (build {clientBuild}), server hotfixes included. Many ranks aren't in the client yet: those show what the rank
        did in Classic, tagged Classic data, and a few talents with no rank in it at all carry their Classic Era name.
        Where Forever changed a talent's other ranks, its Classic ones may be wrong too, and say so. Nothing is worked
        out from the ranks around it.
      </p>
      <p>
        "Changed in Forever" shows what a rank did in Classic (cmangos classic-db) where the Forever text says
        something different. A sentence the client's text leaves blank is left out rather than filled in.
      </p>
    </aside>
  );
}
