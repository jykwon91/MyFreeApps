import { Badge } from "@platform/ui";
import { findClass } from "@/games/wow-forever/data/classes";
import type { ClassPick } from "@/games/wow-forever/data/guide/guideTypes";

export default function ClassPickCard({ pick }: { pick: ClassPick }) {
  const name = findClass(pick.classId)?.name ?? pick.classId;
  return (
    <article className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{name}</h3>
        {pick.beginnerReason ? <Badge label="Recommended for beginners" color="green" /> : null}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{pick.roles}</p>
      <p className="text-sm">{pick.summary}</p>
      {pick.beginnerReason ? (
        <p className="text-sm">
          <span className="font-medium">Why it's a good first class: </span>
          {pick.beginnerReason}
        </p>
      ) : null}
    </article>
  );
}
