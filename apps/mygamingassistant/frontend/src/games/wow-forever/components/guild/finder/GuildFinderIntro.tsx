import { Link } from "react-router-dom";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { GUILD_FINDER_COPY } from "@/games/wow-forever/data/guild/guildFinderConfig";

/** Which guilds the search can find, and how to add yours. */
export default function GuildFinderIntro() {
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-4 text-sm">
      <p>{GUILD_FINDER_COPY.intro}</p>
      <Link
        to={CHARACTER_PAGE_PATH}
        className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 hover:underline"
      >
        {GUILD_FINDER_COPY.lookUp}
      </Link>
    </div>
  );
}
