import clsx from "clsx";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RARE_CLASSIFICATION, RARE_CLASSIFICATION_LABEL } from "@/games/wow-forever/data/rares/raresConfig";
import { rareLevelText } from "@/games/wow-forever/lib/rares/rareText";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface RareTitleProps {
  rare: Rare;
  /** The heading's element: the list's rows are h3, the map card's is p. */
  as: "h3" | "p";
}

/** Name, "Rare" / "Rare elite" (Game files) and level (Classic data). */
export default function RareTitle({ rare, as: Heading }: RareTitleProps) {
  const level = rareLevelText(rare);
  const elite = rare.classification === RARE_CLASSIFICATION.rareElite;
  return (
    <div className="space-y-1">
      <Heading className="text-base font-semibold break-words">{rare.name}</Heading>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={clsx(
              "rounded border px-1.5 text-xs font-medium",
              elite && "border-amber-500 text-amber-700 dark:text-amber-300",
              !elite && "text-muted-foreground",
            )}
            data-testid="rare-classification"
          >
            {elite ? "★ " : ""}
            {RARE_CLASSIFICATION_LABEL[rare.classification]}
          </span>
          <ProvenanceBadge provenance={PROVENANCE.client} />
        </span>
        {level ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground" data-testid="rare-level">
            {level}
            <ProvenanceBadge provenance={PROVENANCE.classic} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
