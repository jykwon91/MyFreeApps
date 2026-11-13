import { Navigate, useLocation } from "react-router-dom";
import { GUILD_PAGE_PATH } from "@/games/wow-forever/data/guild/guildConfig";

/**
 * /wow-forever/guild/:slug — guild pages used to take any guild's slug. The site now shows only
 * topdeadcenter at /wow-forever/guild; old links land there with their query (`?me=`, `?board=`) kept.
 */
export default function WowLegacyGuildRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: GUILD_PAGE_PATH, search }} replace />;
}
