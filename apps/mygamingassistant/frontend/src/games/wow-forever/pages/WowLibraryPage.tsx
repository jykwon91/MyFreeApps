import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import LibraryBookList from "@/games/wow-forever/components/library/LibraryBookList";
import LibraryCards from "@/games/wow-forever/components/library/LibraryCards";
import LibraryNote from "@/games/wow-forever/components/library/LibraryNote";
import LibraryRewards from "@/games/wow-forever/components/library/LibraryRewards";
import LibrarySkeleton from "@/games/wow-forever/components/library/LibrarySkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { LIBRARY_STATUS } from "@/games/wow-forever/data/library/libraryConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useLibrary } from "@/games/wow-forever/hooks/useLibrary";

/** /wow-forever/library — the collectible library books, the library cards and the reward for turning books in, with a found list. */
export default function WowLibraryPage() {
  useDocumentTitle("Library books · WoW Forever");
  const state = useLibrary();
  const data = state.status === LIBRARY_STATUS.ready ? state.data : null;
  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title="Library books"
        subtitle="The books hidden around the world for the library: every book in the game files, the reward for turning them in and a list to tick off."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <LibraryNote />
      {state.status === LIBRARY_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load the library books." onRetry={state.retry} retrying={false} />
      ) : null}
      {data ? (
        <>
          <LibraryRewards quests={data.quests} />
          <LibraryCards cards={data.cards} />
          <LibraryBookList books={data.books} />
        </>
      ) : null}
      {state.status === LIBRARY_STATUS.loading || state.status === LIBRARY_STATUS.idle ? <LibrarySkeleton /> : null}
    </main>
  );
}
