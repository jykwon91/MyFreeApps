import { Crown } from "lucide-react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { GUILD_BANNER_COPY } from "@/games/wow-forever/data/guild/guildBannerConfig";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildBannerMasterProps {
  master: GuildMember;
}

/** The guild master's name in their class colour (the in-game one: the banner is dark in both themes). */
export default function GuildBannerMaster({ master }: GuildBannerMasterProps) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-white/90">
      <Crown aria-hidden className="h-4 w-4 text-[#F2C94C]" />
      <span>{GUILD_BANNER_COPY.master}</span>
      <GuildMemberLink member={master} size="lg" onDark />
    </p>
  );
}
