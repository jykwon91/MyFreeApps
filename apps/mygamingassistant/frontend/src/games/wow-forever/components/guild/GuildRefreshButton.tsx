import { LoadingButton } from "@platform/ui";
import { GUILD_REFRESH_COPY } from "@/games/wow-forever/data/guild/guildRefreshConfig";
import { refreshCooldownCopy } from "@/games/wow-forever/data/refreshCooldownCopy";
import { useGuildRefresh } from "@/games/wow-forever/hooks/useGuildRefresh";
import { cooldownMinutes } from "@/games/wow-forever/lib/refreshCooldown";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

interface GuildRefreshButtonProps {
  guild: GuildResponse;
  refetch: () => unknown;
}

/** "Refresh now": re-pulls the roster and members from Blizzard; waits out the server's cooldown. */
export default function GuildRefreshButton({ guild, refetch }: GuildRefreshButtonProps) {
  const { isRefreshing, cooldownLeft, refresh } = useGuildRefresh(guild, refetch);
  const coolingDown = cooldownLeft > 0 && !isRefreshing;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LoadingButton
        variant="secondary"
        size="sm"
        isLoading={isRefreshing}
        loadingText={GUILD_REFRESH_COPY.loading}
        disabled={coolingDown}
        onClick={() => void refresh()}
        className="min-h-[44px]"
      >
        {GUILD_REFRESH_COPY.button}
      </LoadingButton>
      {coolingDown ? (
        <span role="status" className="text-xs text-muted-foreground">
          {refreshCooldownCopy(cooldownMinutes(cooldownLeft))}
        </span>
      ) : null}
    </div>
  );
}
