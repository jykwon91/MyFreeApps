import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LegacyChallenge } from "@/games/wow-forever/types/legacy/legacyChallenge";

interface LegacyChallengeRowProps {
  challenge: LegacyChallenge;
  checked: boolean;
  onToggle: () => void;
}

/** One challenge with a "Done" tick (the whole label is the 44px target). */
export default function LegacyChallengeRow({ challenge, checked, onToggle }: LegacyChallengeRowProps) {
  return (
    <li>
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/40">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          data-testid={`legacy-challenge-${challenge.id}`}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <GameIcon icon={fileIcon(challenge.icon)} size={24} alt="" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{challenge.title}</span>
          <span className="block text-sm text-muted-foreground">{challenge.text}</span>
        </span>
        <span className="shrink-0 text-sm tabular-nums">
          +{challenge.points} {challenge.points === 1 ? "point" : "points"}
        </span>
      </label>
    </li>
  );
}
