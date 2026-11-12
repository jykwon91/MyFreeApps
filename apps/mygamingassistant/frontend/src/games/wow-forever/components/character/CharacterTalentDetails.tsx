import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import TalentRankText from "@/games/wow-forever/components/talents/TalentRankText";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { talentRankLines } from "@/games/wow-forever/lib/talents/talentRankLines";
import type { CharacterTalentPicked } from "@/games/wow-forever/types/character/characterTalentPicked";

interface CharacterTalentDetailsProps {
  /** The opened talent and the character's rank in it, or null for the hint. */
  picked: CharacterTalentPicked | null;
}

/** Under the trees: what the opened talent does at the character's rank (and the next), announced as it changes. */
export default function CharacterTalentDetails({ picked }: CharacterTalentDetailsProps) {
  return (
    <div aria-live="polite" aria-atomic="true" className="rounded-xl border bg-card p-4" data-testid="character-talent-details">
      {!picked && <p className="text-sm text-muted-foreground">Tap a talent to see what it does.</p>}
      {picked && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <GameIcon icon={fileIcon(picked.talent.icon)} size={32} alt="" />
            <div>
              <p className="font-semibold">{picked.talent.name}</p>
              <p className="text-xs text-muted-foreground">
                Rank {picked.rank}/{picked.talent.ranks.length}
              </p>
            </div>
          </div>
          <TalentRankText lines={talentRankLines(picked.talent, picked.rank)} badges={false} />
        </div>
      )}
    </div>
  );
}
