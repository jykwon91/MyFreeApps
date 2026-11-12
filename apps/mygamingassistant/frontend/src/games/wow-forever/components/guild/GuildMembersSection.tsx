import { useCallback, useMemo } from "react";
import GuildMemberList from "@/games/wow-forever/components/guild/GuildMemberList";
import GuildMemberToolbar from "@/games/wow-forever/components/guild/GuildMemberToolbar";
import { GUILD_SORT_DESCENDING_FIRST, type GuildSortKey } from "@/games/wow-forever/data/guild/guildConfig";
import { useGuildMemberFilters } from "@/games/wow-forever/hooks/useGuildMemberFilters";
import { classCounts, filterMembers, filtersFromParams, sortMembers } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildMembersSectionProps {
  members: readonly GuildMember[];
  rosterUpdatedAt: string | null;
  /** Each member's guild titles, by slug. */
  titles: ReadonlyMap<string, readonly GuildTitle[]>;
}

/** The toolbar and the member list it filters and sorts. */
export default function GuildMembersSection({ members, rosterUpdatedAt, titles }: GuildMembersSectionProps) {
  const [urlFilters, setFilters] = useGuildMemberFilters();
  const classes = useMemo(() => classCounts(members), [members]);
  // A shared link can name a class nobody in the guild plays now: show everyone, as the select does.
  const filters = useMemo(() => {
    if (classes.some(([name]) => name === urlFilters.className)) return urlFilters;
    return { ...urlFilters, className: "" };
  }, [classes, urlFilters]);
  const shown = useMemo(
    () => sortMembers(filterMembers(members, filters), filters.sort, filters.descending),
    [members, filters],
  );

  const onSort = useCallback(
    (column: GuildSortKey) => {
      const descending = column === filters.sort ? !filters.descending : GUILD_SORT_DESCENDING_FIRST.has(column);
      setFilters({ ...filters, sort: column, descending });
    },
    [filters, setFilters],
  );
  const onClearFilters = useCallback(() => setFilters(filtersFromParams(new URLSearchParams())), [setFilters]);

  return (
    <>
      <GuildMemberToolbar filters={filters} classes={classes} onChange={setFilters} />
      <GuildMemberList
        members={shown}
        total={members.length}
        rosterUpdatedAt={rosterUpdatedAt}
        titles={titles}
        sort={filters.sort}
        descending={filters.descending}
        onSort={onSort}
        onClearFilters={onClearFilters}
      />
    </>
  );
}
