import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { classIcon } from "@/games/wow-forever/lib/icons/wowIcons";

/** A crafter's class: its in-game icon and name. */
export default function GuildCrafterClass({ className }: { className: string }) {
  const classId = characterClassId(className);
  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs text-muted-foreground">
      {classId ? <GameIcon icon={classIcon(classId)} size={16} alt="" /> : null}
      {className}
    </span>
  );
}
