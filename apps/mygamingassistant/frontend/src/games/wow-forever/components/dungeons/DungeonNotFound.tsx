import { Link } from "react-router-dom";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { DUNGEONS_PAGE_PATH } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";

/** A dungeon link that names no dungeon we list. */
export default function DungeonNotFound() {
  return (
    <div className="space-y-3" data-testid="dungeon-not-found">
      <EmptyStateNote message="We don't have a dungeon at this address." />
      <Link to={DUNGEONS_PAGE_PATH} className={DETAIL_LINK}>
        See every dungeon
      </Link>
    </div>
  );
}
