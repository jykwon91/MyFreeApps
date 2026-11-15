import clsx from "clsx";
import { Users } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { GUILD_PROFESSION_CHIP, GUILD_PROFESSION_CHIP_ON } from "@/games/wow-forever/data/guild/guildStyles";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { GuildProfessionCount } from "@/games/wow-forever/types/guild/guildProfessionCount";

interface GuildProfessionChipsProps {
  professions: readonly GuildProfessionCount[];
  /** The picked profession; "" for All. */
  value: GuideProfession | "";
  onChange: (profession: GuideProfession | "") => void;
  /** Everyone on the roster, for the All chip. */
  total: number;
}

/**
 * One tap to the members with a profession: All, then each profession someone has, with its icon and count.
 * Tapping the picked chip again goes back to All. One sideways-scrolling row on a phone, wrapping on wider screens.
 */
export default function GuildProfessionChips({ professions, value, onChange, total }: GuildProfessionChipsProps) {
  if (!professions.length) return null;
  return (
    <div
      role="group"
      aria-label="Profession"
      className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      data-testid="guild-profession-chips"
    >
      <button type="button" aria-pressed={value === ""} onClick={() => onChange("")} className={clsx(GUILD_PROFESSION_CHIP, value === "" && GUILD_PROFESSION_CHIP_ON)}>
        <Users className="h-4 w-4" aria-hidden />
        All <span className="tabular-nums text-muted-foreground">{total}</span>
      </button>
      {professions.map((p) => {
        const on = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? "" : p.id)}
            className={clsx(GUILD_PROFESSION_CHIP, on && GUILD_PROFESSION_CHIP_ON)}
          >
            <GameIcon icon={professionIcon(p.id)} size={16} alt="" />
            {p.label} <span className="tabular-nums text-muted-foreground">{p.count}</span>
          </button>
        );
      })}
    </div>
  );
}
