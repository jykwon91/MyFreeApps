import clsx from "clsx";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { TALENT_RANK_TEXT } from "@/games/wow-forever/data/talents/talentCellStyles";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentCellState } from "@/games/wow-forever/types/talents/talentCellState";

interface TalentCellFaceProps {
  talent: Talent;
  rank: number;
  state: TalentCellState;
}

/** What a talent cell shows: the talent's icon and its rank counter ("2/5"), coloured by state. */
export default function TalentCellFace({ talent, rank, state }: TalentCellFaceProps) {
  return (
    <>
      <GameIcon icon={fileIcon(talent.icon)} size={48} alt="" className="pointer-events-none" />
      <span
        aria-hidden
        className={clsx(
          "absolute -bottom-2 -right-2 rounded border bg-card px-1 text-[11px] font-semibold leading-4 tabular-nums",
          TALENT_RANK_TEXT[state],
        )}
      >
        {rank}/{talent.ranks.length}
      </span>
    </>
  );
}
