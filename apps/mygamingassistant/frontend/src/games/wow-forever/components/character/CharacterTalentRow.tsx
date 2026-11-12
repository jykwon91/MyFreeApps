import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { CharacterTalentLine } from "@/games/wow-forever/types/character/characterTalentLine";

/** One talent the character took: icon, name and rank, opening to what their rank does. */
export default function CharacterTalentRow({ line }: { line: CharacterTalentLine }) {
  const [open, setOpen] = useState(false);
  const { talent, rank } = line;
  const max = talent.ranks.length;
  return (
    <li className="rounded-lg border bg-card px-3 py-2" data-testid="character-talent">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-[44px] items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <GameIcon icon={fileIcon(talent.icon)} size={32} alt="" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{talent.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <span aria-hidden>
            {rank}/{max}
          </span>
          <span className="sr-only">
            rank {rank} of {max}
          </span>
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <p className="mt-2 text-sm" data-testid="character-talent-text">
          {talent.ranks[rank - 1]}
        </p>
      )}
    </li>
  );
}
