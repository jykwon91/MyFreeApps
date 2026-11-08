import { useState } from "react";
import ChangeEntryCard from "@/games/wow-forever/components/changes/ChangeEntryCard";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { CHANGE_PAGE_SIZE } from "@/games/wow-forever/data/changes/changeFeedConfig";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";

/** The matching rows, `CHANGE_PAGE_SIZE` at a time. Keyed by the filters, so a new filter starts from the top. */
export default function ChangeFeedList({ entries }: { entries: readonly ChangeEntry[] }) {
  const [shown, setShown] = useState(CHANGE_PAGE_SIZE);
  if (entries.length === 0) return <EmptyStateNote message="No changes match these filters." />;
  const count = entries.length === 1 ? "1 change" : `${entries.length.toLocaleString()} changes`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground" role="status" data-testid="change-count">
        {count}
        {entries.length > shown ? ` · showing ${shown.toLocaleString()}` : ""}
      </p>
      <ul className="space-y-3">
        {entries.slice(0, shown).map((entry) => (
          <ChangeEntryCard key={entry.key} entry={entry} />
        ))}
      </ul>
      {entries.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + CHANGE_PAGE_SIZE)}
          className="min-h-[44px] w-full rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted sm:w-auto"
        >
          Show {Math.min(CHANGE_PAGE_SIZE, entries.length - shown)} more
        </button>
      ) : null}
    </div>
  );
}
