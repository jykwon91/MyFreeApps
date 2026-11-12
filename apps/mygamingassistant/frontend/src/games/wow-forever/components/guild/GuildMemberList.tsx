import { Button } from "@platform/ui";
import type { GuildSortKey } from "@/games/wow-forever/data/guild/guildConfig";
import GuildMemberCards from "@/games/wow-forever/components/guild/GuildMemberCards";
import GuildMemberTable from "@/games/wow-forever/components/guild/GuildMemberTable";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberListProps {
  /** Already filtered and sorted. */
  members: readonly GuildMember[];
  total: number;
  rosterUpdatedAt: string | null;
  sort: GuildSortKey;
  descending: boolean;
  onSort: (column: GuildSortKey) => void;
  onClearFilters: () => void;
}

/** "Showing X of Y", then the members as a table or cards, or a way out when nothing matches. */
export default function GuildMemberList({
  members,
  total,
  rosterUpdatedAt,
  sort,
  descending,
  onSort,
  onClearFilters,
}: GuildMemberListProps) {
  return (
    <section className="space-y-2" aria-label="Members">
      <p role="status" className="text-sm text-muted-foreground">
        Showing {members.length} of {total} members
      </p>
      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-6 space-y-3 text-sm">
          <p>No members match.</p>
          <Button variant="secondary" size="sm" onClick={onClearFilters} className="min-h-[44px]">
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <GuildMemberTable members={members} rosterUpdatedAt={rosterUpdatedAt} sort={sort} descending={descending} onSort={onSort} />
          <GuildMemberCards members={members} rosterUpdatedAt={rosterUpdatedAt} />
          <p className="text-xs text-muted-foreground">Blizzard shares rank numbers, not names. Lower is higher.</p>
        </>
      )}
    </section>
  );
}
