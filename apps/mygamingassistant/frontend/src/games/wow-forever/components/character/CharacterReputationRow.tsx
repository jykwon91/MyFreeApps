import clsx from "clsx";
import { GUARDS_ATTACK_NOTE } from "@/games/wow-forever/data/character/characterReputationConfig";
import {
  formatStandingProgress,
  guardsAttack,
  isAtCap,
  standingBar,
  standingPercent,
  standingTone,
} from "@/games/wow-forever/lib/character/characterReputation";
import type { CharacterReputation } from "@/games/wow-forever/types/character/characterReputation";

interface CharacterReputationRowProps {
  reputation: CharacterReputation;
  groupId: number;
}

/** One faction: its name, the standing in words (colour only backs it up), progress, and a bar. */
export default function CharacterReputationRow({ reputation, groupId }: CharacterReputationRowProps) {
  const atCap = isAtCap(reputation);
  return (
    <li className="space-y-1.5 py-2" data-testid="character-reputation">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 font-medium">{reputation.name}</span>
        <span className="flex items-baseline gap-2">
          <span
            className={clsx("rounded-md px-2 py-0.5 text-xs font-semibold", standingTone(reputation.tier))}
            data-testid="character-reputation-standing"
          >
            {reputation.standing}
          </span>
          {!atCap && (
            <span className="tabular-nums text-sm" data-testid="character-reputation-progress">
              {formatStandingProgress(reputation)}
            </span>
          )}
        </span>
      </div>
      {!atCap && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={clsx("h-full rounded-full", standingBar(reputation.tier))}
            style={{ width: `${standingPercent(reputation)}%` }}
          />
        </div>
      )}
      {guardsAttack(groupId, reputation.tier) && (
        <p className="text-xs font-medium text-destructive" data-testid="character-reputation-warning">
          {GUARDS_ATTACK_NOTE}
        </p>
      )}
    </li>
  );
}
