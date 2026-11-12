import { GUILD_MISSING_VALUE, GUILD_SORT_KEYS, type GuildSortKey } from "@/games/wow-forever/data/guild/guildConfig";
import { GUILD_NUMBER_CELL } from "@/games/wow-forever/data/guild/guildStyles";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import GuildMemberStaleNote from "@/games/wow-forever/components/guild/GuildMemberStaleNote";
import GuildSortHeader from "@/games/wow-forever/components/guild/GuildSortHeader";
import { rankLabel } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberTableProps {
  members: readonly GuildMember[];
  rosterUpdatedAt: string | null;
  sort: GuildSortKey;
  descending: boolean;
  onSort: (column: GuildSortKey) => void;
}

/** The member list as a sortable table (wider screens). */
export default function GuildMemberTable({ members, rosterUpdatedAt, sort, descending, onSort }: GuildMemberTableProps) {
  const header = { sort, descending, onSort };
  return (
    <div className="hidden md:block overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Guild members; select a column to sort</caption>
        <thead className="border-b text-left">
          <tr>
            <GuildSortHeader column={GUILD_SORT_KEYS.name} {...header} className="px-3" />
            <GuildSortHeader column={GUILD_SORT_KEYS.level} {...header} className="px-3 text-right" />
            <GuildSortHeader column={GUILD_SORT_KEYS.className} {...header} className="px-3" />
            <GuildSortHeader column={GUILD_SORT_KEYS.itemLevel} {...header} className="px-3 text-right" />
            <GuildSortHeader column={GUILD_SORT_KEYS.rank} {...header} className="px-3" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.slug} className="border-b last:border-b-0">
              <td className="px-3 py-1">
                <GuildMemberLink member={m} />
                <GuildMemberStaleNote member={m} rosterUpdatedAt={rosterUpdatedAt} />
              </td>
              <td className={GUILD_NUMBER_CELL}>{m.level ?? GUILD_MISSING_VALUE}</td>
              <td className="px-3 py-1">{m.class_name ?? GUILD_MISSING_VALUE}</td>
              <td className={GUILD_NUMBER_CELL}>{m.item_level ?? GUILD_MISSING_VALUE}</td>
              <td className="px-3 py-1">{rankLabel(m.rank) ?? GUILD_MISSING_VALUE}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
