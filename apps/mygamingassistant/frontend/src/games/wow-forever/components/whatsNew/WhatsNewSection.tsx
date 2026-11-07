import { useState } from "react";
import WhatsNewEntryRow from "@/games/wow-forever/components/whatsNew/WhatsNewEntryRow";
import { WHATS_NEW_HUB_COUNT } from "@/games/wow-forever/data/whatsNewSettings";
import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

interface WhatsNewSectionProps {
  /** Newest first. */
  entries: readonly WhatsNewEntry[];
}

/** The hub's "What's new on this site": the latest few changes, with "Show all" for the rest. */
export default function WhatsNewSection({ entries }: WhatsNewSectionProps) {
  const [showAll, setShowAll] = useState(false);
  if (entries.length === 0) return null;
  const hasMore = entries.length > WHATS_NEW_HUB_COUNT;
  const shown = showAll ? entries : entries.slice(0, WHATS_NEW_HUB_COUNT);
  return (
    <section aria-labelledby="wow-whats-new-heading" className="rounded-xl border bg-card p-4 sm:p-5 space-y-2">
      <h2
        id="wow-whats-new-heading"
        className="text-sm font-semibold text-muted-foreground uppercase tracking-wide"
      >
        What&rsquo;s new on this site
      </h2>
      <ol id="wow-whats-new-list" className="divide-y">
        {shown.map((entry) => (
          <WhatsNewEntryRow key={`${entry.date}-${entry.title}`} entry={entry} />
        ))}
      </ol>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          aria-controls="wow-whats-new-list"
          className="min-h-[44px] text-sm font-medium text-primary hover:underline"
        >
          {showAll ? "Show fewer" : `Show all (${entries.length})`}
        </button>
      )}
    </section>
  );
}
