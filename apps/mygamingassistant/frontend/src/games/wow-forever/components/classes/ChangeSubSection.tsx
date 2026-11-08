import { Link } from "react-router-dom";
import { SPELLBOOK_PATH } from "@/games/wow-forever/data/spellbook/spellbookConfig";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";

/** How many entries to preview per category before the "See all" link. */
export const PREVIEW_COUNT = 5;

export interface ChangeSubSectionProps {
  heading: string;
  entries: readonly ChangeEntry[];
  seeAllHref: string;
  /** When set, spell entries that have no own href link here (the class spellbook). */
  spellbookClassId?: WowClassId;
  testId: string;
}

/** One category's preview list (N entries + "See all" link) inside ClassChangesSection. */
export default function ChangeSubSection({ heading, entries, seeAllHref, spellbookClassId, testId }: ChangeSubSectionProps) {
  const preview = entries.slice(0, PREVIEW_COUNT);
  const remaining = entries.length - preview.length;
  const spellbookHref = spellbookClassId ? `${SPELLBOOK_PATH}/${spellbookClassId}` : null;

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-sm font-medium">
        {entries.length} changed {heading.toLowerCase()}
      </p>
      {preview.length === 0 ? (
        <p className="text-sm text-muted-foreground">None found.</p>
      ) : (
        <ul className="space-y-0.5">
          {preview.map((entry) => {
            const href = entry.href ?? spellbookHref;
            return (
              <li key={entry.key} className="text-sm">
                {href ? (
                  <Link
                    to={href}
                    className="hover:underline underline-offset-2 text-foreground"
                    data-testid="class-change-entry-link"
                  >
                    {entry.name}
                  </Link>
                ) : (
                  <span>{entry.name}</span>
                )}
                {entry.summary ? <span className="text-muted-foreground"> — {entry.summary}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        to={seeAllHref}
        className="inline-flex items-center text-sm underline underline-offset-2 min-h-[44px]"
        data-testid={`${testId}-see-all`}
      >
        {remaining > 0 ? `See all ${entries.length} →` : `See all in Changes →`}
      </Link>
    </div>
  );
}
