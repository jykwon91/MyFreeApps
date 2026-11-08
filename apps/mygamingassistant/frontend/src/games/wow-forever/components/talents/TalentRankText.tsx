import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import TalentRankBody from "@/games/wow-forever/components/talents/TalentRankBody";
import type { TalentRankLine } from "@/games/wow-forever/types/talents/talentRankLine";

interface TalentRankTextProps {
  lines: readonly TalentRankLine[];
  /** Provenance badges after each text — off in the hover tooltip, which can't be clicked into. */
  badges: boolean;
}

/**
 * A talent's rank you have and the next one, as the game words them, each
 * with what it was in Classic when Forever changed it.
 */
export default function TalentRankText({ lines, badges }: TalentRankTextProps) {
  return (
    <dl className="space-y-2">
      {lines.map((line) => (
        <div key={line.rank} className="space-y-1" data-testid="talent-rank-line">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{line.label}</dt>
          <TalentRankBody line={line} badges={badges} />
          {line.classicText ? (
            <dd className="rounded-md border-l-2 border-amber-400 bg-muted/30 px-2 py-1 text-xs" data-testid="talent-classic-text">
              <span className="font-semibold">Changed in Forever. Classic: </span>
              {line.classicText}
              {badges ? (
                <>
                  {" "}
                  <ProvenanceBadge provenance="classic" />
                </>
              ) : null}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
