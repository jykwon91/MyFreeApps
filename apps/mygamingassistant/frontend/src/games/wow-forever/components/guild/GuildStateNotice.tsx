import { Link } from "react-router-dom";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { Button } from "@platform/ui";
import { GUILD_PAGE_STATES, GUILD_STATE_MESSAGES, type GuildPageState } from "@/games/wow-forever/data/guild/guildConfig";

interface GuildStateNoticeProps {
  state: GuildPageState;
  /** Check again, while the roster is being collected. */
  onRetry: () => void;
  retrying: boolean;
}

/** What shows in place of the member list: guild not stored, roster not collected yet, or guild gone. */
export default function GuildStateNotice({ state, onRetry, retrying }: GuildStateNoticeProps) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-6 space-y-3 text-sm">
      <p>{GUILD_STATE_MESSAGES[state]}</p>
      <div className="flex flex-wrap gap-2">
        {state === GUILD_PAGE_STATES.collecting ? (
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying} className="min-h-[44px]">
            {retrying ? "Checking…" : "Check again"}
          </Button>
        ) : null}
        <Link
          to={CHARACTER_PAGE_PATH}
          className="inline-flex min-h-[44px] items-center rounded-md px-1 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Look up a character
        </Link>
      </div>
    </div>
  );
}
