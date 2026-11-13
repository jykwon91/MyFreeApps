import { useCallback, useEffect, useRef, useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { useRefreshGuildMutation } from "@/games/wow-forever/api/wowGuildApi";
import {
  GUILD_REFRESH_COPY,
  GUILD_REFRESH_POLL_MS,
  GUILD_REFRESH_WATCH_TIMEOUT_MS,
  guildRefreshCooldownCopy,
} from "@/games/wow-forever/data/guild/guildRefreshConfig";
import { baselineOf, cooldownLeftMs, cooldownMinutes, refreshFinished } from "@/games/wow-forever/lib/guild/refreshCooldown";
import { statusOf } from "@/games/wow-forever/lib/raidPageError";
import type { GuildRefreshBaseline } from "@/games/wow-forever/types/guild/guildRefreshBaseline";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

const TOO_MANY_REQUESTS = 429;

interface GuildRefresh {
  /** The refresh was asked for and the page is waiting for it to finish. */
  isRefreshing: boolean;
  /** Milliseconds until "Refresh now" works again; 0 when it does. */
  cooldownLeft: number;
  refresh: () => Promise<void>;
}

/**
 * "Refresh now" on the guild page. A click starts the refresh on the server (it answers at once and
 * runs in the background), then the page re-reads the guild until its roster time or failure time
 * changes, and says how it went. The cooldown comes from the guild (`refresh_available_at`).
 */
export function useGuildRefresh(guild: GuildResponse, refetch: () => unknown): GuildRefresh {
  const [start] = useRefreshGuildMutation();
  const [watching, setWatching] = useState<GuildRefreshBaseline | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const cooldownLeft = cooldownLeftMs(guild.refresh_available_at, nowMs);

  // Re-render when the cooldown runs out, so the button comes back on its own.
  useEffect(() => {
    if (guild.refresh_available_at === null) return undefined;
    const wait = cooldownLeftMs(guild.refresh_available_at, Date.now());
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => setNowMs(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [guild.refresh_available_at]);

  // The roster or failure time moved: the refresh is done.
  const finished = watching !== null && refreshFinished(watching, guild);
  const isRefreshing = watching !== null && !finished;

  // While waiting: read the guild again every few seconds, and give up after a while.
  useEffect(() => {
    if (!isRefreshing) return undefined;
    const poll = window.setInterval(() => {
      setNowMs(Date.now());
      void refetch();
    }, GUILD_REFRESH_POLL_MS);
    const giveUp = window.setTimeout(() => {
      setWatching(null);
      showError(GUILD_REFRESH_COPY.slow);
    }, GUILD_REFRESH_WATCH_TIMEOUT_MS);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
  }, [isRefreshing, refetch]);

  // Say how a finished refresh went, once.
  const reported = useRef<GuildRefreshBaseline | null>(null);
  useEffect(() => {
    if (!finished || reported.current === watching) return;
    reported.current = watching;
    if (guild.refresh_failed) showError(GUILD_REFRESH_COPY.failed);
    else showSuccess(GUILD_REFRESH_COPY.success);
  }, [finished, watching, guild.refresh_failed]);

  const refresh = useCallback(async () => {
    setWatching(baselineOf(guild));
    setNowMs(Date.now());
    try {
      const answer = await start(guild.slug).unwrap();
      // The server stamped its cooldown before answering: count from now, not from the click.
      setNowMs(Date.now());
      if (answer.status === "cooldown") {
        setWatching(null);
        showError(guildRefreshCooldownCopy(cooldownMinutes(answer.retry_after_seconds * 1000)));
      }
    } catch (error) {
      setWatching(null);
      showError(statusOf(error) === TOO_MANY_REQUESTS ? GUILD_REFRESH_COPY.tooMany : GUILD_REFRESH_COPY.startFailed);
    }
    // Either way the guild has a new cooldown to show.
    void refetch();
  }, [guild, start, refetch]);

  return { isRefreshing, cooldownLeft, refresh };
}
