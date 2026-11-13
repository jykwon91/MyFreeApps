import { useParams } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import DungeonBossNav from "@/games/wow-forever/components/dungeons/DungeonBossNav";
import DungeonBossSection from "@/games/wow-forever/components/dungeons/DungeonBossSection";
import DungeonLocation from "@/games/wow-forever/components/dungeons/DungeonLocation";
import DungeonFootnote from "@/games/wow-forever/components/dungeons/DungeonFootnote";
import DungeonWhen from "@/games/wow-forever/components/dungeons/DungeonWhen";
import DungeonNotFound from "@/games/wow-forever/components/dungeons/DungeonNotFound";
import DungeonPageSkeleton from "@/games/wow-forever/components/dungeons/DungeonPageSkeleton";
import DungeonQuests from "@/games/wow-forever/components/dungeons/quests/DungeonQuests";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { DUNGEON_LOOT_EMPTY, DUNGEONS_PAGE_PATH } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useDungeons } from "@/games/wow-forever/hooks/useDungeons";
import { useScrollToHash } from "@/games/wow-forever/hooks/useScrollToHash";
import { findDungeon } from "@/games/wow-forever/lib/dungeons/decodeDungeons";

const BACK_LABEL = "Back to Dungeons";

/** /wow-forever/dungeons/:slug — one dungeon: when you can go, where it is, its quests, bosses in order and their loot. */
export default function WowDungeonPage() {
  const { slug } = useParams();
  const state = useDungeons();
  const dungeon = state.status === "ready" ? findDungeon(state.data, slug) : null;
  useDocumentTitle(dungeon ? `${dungeon.name} · WoW Forever` : "Dungeons · WoW Forever");
  useScrollToHash(dungeon !== null);

  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-4xl">
      {state.status === "loading" ? <DungeonPageSkeleton /> : null}
      {state.status === "error" ? (
        <LoadErrorRetry message="Couldn't load this dungeon." onRetry={state.retry} retrying={state.retrying} />
      ) : null}
      {state.status === "ready" && !dungeon ? (
        <>
          <WowPageHeader title="Dungeon not found" subtitle="" backTo={DUNGEONS_PAGE_PATH} backLabel={BACK_LABEL} />
          <DungeonNotFound />
        </>
      ) : null}
      {state.status === "ready" && dungeon ? (
        <>
          <WowPageHeader
            title={dungeon.name}
            subtitle={dungeon.aliases.length > 0 ? `Also called ${dungeon.aliases.join(", ")}` : "Dungeon"}
            backTo={DUNGEONS_PAGE_PATH}
            backLabel={BACK_LABEL}
          />
          <DungeonWhen dungeon={dungeon} />
          <DungeonLocation dungeon={dungeon} />
          <DungeonQuests dungeon={dungeon} />
          {dungeon.bosses.length === 0 ? <EmptyStateNote message={DUNGEON_LOOT_EMPTY.noBosses} /> : null}
          {dungeon.bosses.length > 0 ? <DungeonBossNav bosses={dungeon.bosses} /> : null}
          {dungeon.bosses.map((boss, i) => (
            <DungeonBossSection key={boss.slug} boss={boss} order={i + 1} />
          ))}
          <DungeonFootnote clientBuild={state.data.clientBuild} />
        </>
      ) : null}
    </div>
  );
}
