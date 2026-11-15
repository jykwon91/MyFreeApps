import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { BADGE } from "@/games/wow-forever/data/badgeStyles";
import { guideProfession } from "@/games/wow-forever/lib/character/characterProfessions";
import { professionName } from "@/games/wow-forever/lib/guild/guildRecipes";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";

/** The recipe's profession as a tag with its in-game icon. */
export default function GuildRecipeProfession({ professionId }: { professionId: number }) {
  const guide = guideProfession(professionId);
  return (
    <span className={`${BADGE} inline-flex items-center gap-1`}>
      {guide ? <GameIcon icon={professionIcon(guide)} size={16} alt="" /> : null}
      {professionName(professionId)}
    </span>
  );
}
