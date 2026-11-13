import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import DungeonFootnote from "@/games/wow-forever/components/dungeons/DungeonFootnote";
import DungeonList from "@/games/wow-forever/components/dungeons/DungeonList";
import DungeonListSkeleton from "@/games/wow-forever/components/dungeons/DungeonListSkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useDungeons } from "@/games/wow-forever/hooks/useDungeons";

/** /wow-forever/dungeons — every dungeon, lowest level first. */
export default function WowDungeonsPage() {
  useDocumentTitle("Dungeons · WoW Forever");
  const state = useDungeons();
  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title="Dungeons"
        subtitle="Every dungeon's level, where it is, its bosses and, for the Classic ones, what they drop."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      {state.status === "loading" ? <DungeonListSkeleton /> : null}
      {state.status === "error" ? (
        <LoadErrorRetry message="Couldn't load the dungeons." onRetry={state.retry} retrying={state.retrying} />
      ) : null}
      {state.status === "ready" ? (
        <>
          <DungeonList dungeons={state.data.dungeons} />
          <DungeonFootnote clientBuild={state.data.clientBuild} />
        </>
      ) : null}
    </div>
  );
}
