import ChangeFeedBody from "@/games/wow-forever/components/changes/ChangeFeedBody";
import ChangeFeedNote from "@/games/wow-forever/components/changes/ChangeFeedNote";
import ChangeFiltersBar from "@/games/wow-forever/components/changes/ChangeFiltersBar";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useChangeFilters } from "@/games/wow-forever/hooks/useChangeFilters";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

/** /wow-forever/changes — what WoW Forever changed from Classic, worked out from the two clients' game files. */
export default function WowChangesPage() {
  useDocumentTitle("Changes vs Classic · WoW Forever");
  const [filters, setFilters] = useChangeFilters();
  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title="Changes vs Classic"
        subtitle="Talents, class spells, items, quests and zones that WoW Forever changed or added, old and new side by side."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <ChangeFeedNote />
      <ChangeFiltersBar filters={filters} onChange={setFilters} />
      <ChangeFeedBody filters={filters} />
    </main>
  );
}
