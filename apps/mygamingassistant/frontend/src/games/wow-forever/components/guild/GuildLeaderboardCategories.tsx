import clsx from "clsx";
import { LEADERBOARD_CHIP, LEADERBOARD_CHIP_ON } from "@/games/wow-forever/data/guild/guildStyles";

interface GuildLeaderboardCategoriesProps {
  categories: readonly string[];
  current: string;
  onPick: (category: string) => void;
}

/** The board categories as chips (Character, PvP, Reputation, This week, Professions); one row that scrolls on a phone. */
export default function GuildLeaderboardCategories({ categories, current, onPick }: GuildLeaderboardCategoriesProps) {
  return (
    <div role="group" aria-label="Board category" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={category === current}
          className={clsx(LEADERBOARD_CHIP, category === current && LEADERBOARD_CHIP_ON)}
          onClick={() => onPick(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
