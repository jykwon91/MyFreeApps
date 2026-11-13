import { useCallback, useMemo } from "react";
import GuildMemberList from "@/games/wow-forever/components/guild/GuildMemberList";
import GuildMemberToolbar from "@/games/wow-forever/components/guild/GuildMemberToolbar";
import { GUILD_SORT_DESCENDING_FIRST, type GuildSortKey } from "@/games/wow-forever/data/guild/guildConfig";
import { useGuildMemberFilters } from "@/games/wow-forever/hooks/useGuildMemberFilters";
import { professionCounts } from "@/games/wow-forever/lib/guild/guildMemberProfessions";
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
  const professions = useMemo(() => professionCounts(members), [members]);
  // A shared link can name a class or profession nobody in the guild has now: show everyone, as the selects do.
  const filters = useMemo(() => {
    const className = classes.some(([name]) => name === urlFilters.className) ? urlFilters.className : "";
    const profession = professions.some((p) => p.id === urlFilters.profession) ? urlFilters.profession : "";
    return { ...urlFilters, className, profession };
  }, [classes, professions, urlFilters]);
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
      <GuildMemberToolbar filters={filters} classes={classes} professions={professions} onChange={setFilters} />
      <GuildMemberList
        members={shown}
        total={members.length}
        rosterUpdatedAt={rosterUpdatedAt}
        titles={titles}
        profession={filters.profession}
        sort={filters.sort}
        descending={filters.descending}
        onSort={onSort}
        onClearFilters={onClearFilters}
      />
    </>
  );
}
