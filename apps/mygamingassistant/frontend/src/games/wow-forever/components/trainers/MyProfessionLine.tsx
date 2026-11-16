import { Link } from "react-router-dom";
import { UserRound } from "lucide-react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import { MY_PROFESSION_COPY as COPY } from "@/games/wow-forever/data/trainers/trainersConfig";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { MyProfessionState } from "@/games/wow-forever/types/trainers/myProfessionState";

interface MyProfessionLineProps {
  state: MyProfessionState;
  professionLabel: string;
  pageFactionLabel: string;
}

const LINE = "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm";
const LINK = "inline-flex items-center min-h-[44px] underline underline-offset-2";

/** Whose character marks the recipes below, or how to pick one. */
export default function MyProfessionLine({ state, professionLabel, pageFactionLabel }: MyProfessionLineProps) {
  if (state.kind === "loading") {
    return <p className={`${LINE} text-muted-foreground min-h-[44px]`} role="status" aria-busy="true" data-testid="my-profession">{COPY.loading}</p>;
  }
  if (state.kind === "error") {
    return (
      <div className={LINE} data-testid="my-profession">
        <LoadErrorRetry message={COPY.error} onRetry={state.retry} retrying={state.retrying} />
        <Link to={COPY.characterPath} className={LINK}>{COPY.change}</Link>
      </div>
    );
  }
  if (state.kind === "none") {
    return (
      <p className={LINE} data-testid="my-profession">
        <span>{COPY.none}</span>
        <Link to={COPY.characterPath} className={LINK}>{COPY.pick}</Link>
      </p>
    );
  }
  const change = <Link to={COPY.characterPath} className={LINK}>{COPY.change}</Link>;
  if (state.kind === "not-learned") {
    return (
      <p className={LINE} data-testid="my-profession">
        <span>{COPY.notLearned(state.characterName, professionLabel)}</span>
        {change}
      </p>
    );
  }
  const { mine, lastLogin, otherFaction } = state;
  return (
    <div className="space-y-0.5" data-testid="my-profession">
      <p className={LINE}>
        <span className="inline-flex items-center gap-1.5 font-medium">
          <UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {COPY.ready(mine.characterName, professionLabel, mine.skill, mine.maxSkill)}
        </span>
        {change}
      </p>
      {otherFaction ? <p className="text-sm">{COPY.otherFaction(mine.characterName, otherFaction, pageFactionLabel)}</p> : null}
      {lastLogin ? <p className="text-xs text-muted-foreground">{COPY.asOf(relativeTime(lastLogin))}</p> : null}
    </div>
  );
}
