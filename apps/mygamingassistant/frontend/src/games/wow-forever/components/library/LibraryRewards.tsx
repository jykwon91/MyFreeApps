import { Link } from "react-router-dom";
import LibraryFactRow from "@/games/wow-forever/components/library/LibraryFactRow";
import LibraryRewardItemRow from "@/games/wow-forever/components/library/LibraryRewardItemRow";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { LIBRARY_EMPTY, LIBRARY_UNKNOWN } from "@/games/wow-forever/data/library/libraryConfig";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import type { LibraryQuest } from "@/games/wow-forever/types/library/libraryQuest";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface LibraryRewardsProps {
  quests: readonly LibraryQuest[];
  seenOn: string;
}

/** "Turning books in": who takes them and how many (not known yet), then each reward quest and its rewards. */
export default function LibraryRewards({ quests, seenOn }: LibraryRewardsProps) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="library-rewards" data-testid="library-rewards">
      <h2 id="library-rewards" className="text-base font-semibold">Turning books in</h2>
      <dl className="space-y-2 text-sm">
        <LibraryFactRow label="Who takes the books">
          <span data-testid="library-turn-in">{LIBRARY_UNKNOWN.turnIn}</span>
        </LibraryFactRow>
        <LibraryFactRow label="Books for a reward">
          <span data-testid="library-books-needed">{LIBRARY_UNKNOWN.booksNeeded}</span>
        </LibraryFactRow>
      </dl>
      {quests.length === 0 ? <p className="text-sm text-muted-foreground">{LIBRARY_EMPTY.noRewardQuest}</p> : null}
      {quests.map((quest) => (
        <div key={quest.id} className="space-y-2 border-t pt-3" data-testid="library-quest" data-quest-id={quest.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={questPageHref(quest.id)} className="font-medium underline-offset-2 hover:underline min-h-[44px] content-center">
              {quest.title}
            </Link>
            <span className="text-sm text-muted-foreground">Level {quest.level}</span>
            <ProvenanceBadge provenance={PROVENANCE.seen} date={seenOn} />
          </div>
          {quest.choices.length > 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">Choose one:</p>
              <ul>
                {quest.choices.map((item) => (
                  <LibraryRewardItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ) : null}
          {quest.rewards.length > 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">You also get:</p>
              <ul>
                {quest.rewards.map((item) => (
                  <LibraryRewardItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
