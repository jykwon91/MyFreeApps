import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { FOREVER_CHANGED_OTHER_RANKS, RANK_NOT_IN_FILES } from "@/games/wow-forever/lib/talents/talentRankLines";
import type { TalentRankLine } from "@/games/wow-forever/types/talents/talentRankLine";

interface TalentRankBodyProps {
  line: TalentRankLine;
  badges: boolean;
}

/**
 * One rank's text: Forever's (Game files), else Classic's in its place (Classic
 * data — with a note when Forever changed the talent's other ranks), else a
 * line saying the rank isn't in the game files yet. Never a worked-out value.
 */
export default function TalentRankBody({ line, badges }: TalentRankBodyProps) {
  if (line.text) {
    return (
      <dd className="text-sm">
        {line.text}
        {badges && (
          <>
            {" "}
            <ProvenanceBadge provenance="client" />
          </>
        )}
      </dd>
    );
  }
  if (line.fallbackText) {
    return (
      <>
        <dd className="text-sm" data-testid="talent-fallback-text">
          {!badges && <span className="font-semibold">Classic: </span>}
          {line.fallbackText}
          {badges && (
            <>
              {" "}
              <ProvenanceBadge provenance="classic" />
            </>
          )}
        </dd>
        {line.changedElsewhere && (
          <dd className="text-xs italic text-muted-foreground" data-testid="talent-changed-elsewhere">
            {FOREVER_CHANGED_OTHER_RANKS}
          </dd>
        )}
      </>
    );
  }
  return (
    <dd className="text-sm italic text-muted-foreground">{RANK_NOT_IN_FILES}</dd>
  );
}
