import { Link } from "react-router-dom";
import { dungeonGuideHref, dungeonTitle } from "@/games/wow-forever/lib/character/characterDungeons";
import type { CharacterDungeon } from "@/games/wow-forever/types/character/characterDungeon";

/** The dungeon's name, linked to its guide when it has one. */
export default function CharacterDungeonName({ dungeon }: { dungeon: CharacterDungeon }) {
  const href = dungeonGuideHref(dungeon);
  const title = dungeonTitle(dungeon);
  if (href === null) return <span className="font-medium">{title}</span>;
  return (
    <Link to={href} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
      {title}
    </Link>
  );
}
