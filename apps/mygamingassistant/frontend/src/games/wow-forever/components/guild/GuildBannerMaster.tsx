import { Crown } from "lucide-react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { GUILD_BANNER_COPY } from "@/games/wow-forever/data/guild/guildBannerConfig";
import { CLASS_NAME_TEXT_ON_DARK } from "@/games/wow-forever/data/guild/guildStyles";
import { memberClassStyle } from "@/games/wow-forever/lib/guild/memberClassStyle";
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
      <GuildMemberLink member={master} className={`${CLASS_NAME_TEXT_ON_DARK} text-base font-bold`} style={memberClassStyle(master.class_name)} />
    </p>
  );
}
