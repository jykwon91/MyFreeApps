import { Skeleton } from "@platform/ui";
import { Link } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { BEFORE_YOU_GO_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import type { BattleNetQuestsState } from "@/games/wow-forever/types/dungeons/battleNetQuestsState";

const LINK = `${DETAIL_LINK} min-h-11`;

interface BattleNetQuestsLineProps {
  state: BattleNetQuestsState;
}

/** The one helper line under the intro: where the ticks come from, by the saved character's state. */
export default function BattleNetQuestsLine({ state }: BattleNetQuestsLineProps) {
  return (
    <div className="space-y-1 text-sm text-muted-foreground" data-testid="battlenet-quests" data-state={state.kind}>
      {body(state)}
    </div>
  );
}

function body(state: BattleNetQuestsState) {
  switch (state.kind) {
    case "none":
      return (
        <>
          <p>{BEFORE_YOU_GO_COPY.ticksHint}</p>
          <Link to={CHARACTER_PAGE_PATH} className={LINK}>{BEFORE_YOU_GO_COPY.pickCharacter}</Link>
        </>
      );
    case "loading":
      return (
        <>
          <span role="status" className="sr-only">{BEFORE_YOU_GO_COPY.battleNetLoading}</span>
          <Skeleton className="h-5 w-full max-w-md" />
          <Skeleton className="h-11 w-32" />
        </>
      );
    case "error":
      return <LoadErrorRetry message={BEFORE_YOU_GO_COPY.battleNetError} onRetry={state.retry} retrying={state.retrying} />;
    case "not-found":
      return (
        <>
          <p role="status">{BEFORE_YOU_GO_COPY.battleNetNotFound(state.characterName)}</p>
          <Link to={CHARACTER_PAGE_PATH} className={LINK}>{BEFORE_YOU_GO_COPY.changeCharacter}</Link>
        </>
      );
    case "ready":
      return (
        <>
          <p role="status">{BEFORE_YOU_GO_COPY.battleNetReady(state.characterName)}</p>
          <Link to={CHARACTER_PAGE_PATH} className={LINK}>{BEFORE_YOU_GO_COPY.changeCharacter}</Link>
        </>
      );
  }
}
