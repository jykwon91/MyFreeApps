import GuildPageSections from "@/games/wow-forever/components/guild/GuildPageSections";
import { useGuildTab } from "@/games/wow-forever/hooks/useGuildTab";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

interface GuildSectionsHarnessProps {
  guild: GuildResponse;
}

/** The guild page's tabbed sections with the tab kept in the URL, as GuildPageBody wires them. */
export default function GuildSectionsHarness({ guild }: GuildSectionsHarnessProps) {
  const [tab, setTab] = useGuildTab();
  return <GuildPageSections guild={guild} tab={tab} onTab={setTab} />;
}
