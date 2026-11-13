import { Navigate, useLocation } from "react-router-dom";
import { GUILD_PAGE_PATH } from "@/games/wow-forever/data/guild/guildConfig";

/**
 * /wow-forever/guild and /wow-forever/guild/:slug — where the guild page used to be (it once took any
 * guild's slug). The site shows only topdeadcenter, at /wow-forever/topdeadcenter; old links land there
 * with their query (`?me=`, `?board=`, `?tab=`) and hash kept.
 */
export default function WowLegacyGuildRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: GUILD_PAGE_PATH, search, hash }} replace />;
}
