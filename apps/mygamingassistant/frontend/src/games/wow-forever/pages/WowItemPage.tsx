import { useLocation, useParams } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import ItemHowToGet from "@/games/wow-forever/components/itemPages/ItemHowToGet";
import ItemNotFound from "@/games/wow-forever/components/itemPages/ItemNotFound";
import ItemPageFootnote from "@/games/wow-forever/components/itemPages/ItemPageFootnote";
import ItemPageHeader from "@/games/wow-forever/components/itemPages/ItemPageHeader";
import ItemPageSkeleton from "@/games/wow-forever/components/itemPages/ItemPageSkeleton";
import ItemStatsBlock from "@/games/wow-forever/components/itemPages/ItemStatsBlock";
import { DEFAULT_ITEM_BACK } from "@/games/wow-forever/data/itemPages/itemPageConfig";
import { useItemPage } from "@/games/wow-forever/hooks/useItemPage";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { parseItemId } from "@/games/wow-forever/lib/itemPages/itemPageHref";
import { backFromState } from "@/games/wow-forever/lib/itemPages/itemPageBack";
import { ITEM_PAGE_RESULT } from "@/games/wow-forever/types/itemPages/itemPageResultKind";

/** /wow-forever/items/:id — what an item is and how to get it. */
export default function WowItemPage() {
  const { id } = useParams();
  const location = useLocation();
  const [{ faction, zoneId, level }] = usePlayerSettings();
  const state = useItemPage(parseItemId(id));
  const back = backFromState(location.state) ?? DEFAULT_ITEM_BACK;

  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-4xl">
      {state.status === "loading" ? <ItemPageSkeleton /> : null}
      {state.status === "error" ? (
        <LoadErrorRetry message="Couldn't load this item." onRetry={state.retry} retrying={state.retrying} />
      ) : null}
      {state.status === "ready" && state.result.kind !== ITEM_PAGE_RESULT.found ? (
        <ItemNotFound result={state.result} backTo={back.to} backLabel={back.label} />
      ) : null}
      {state.status === "ready" && state.result.kind === ITEM_PAGE_RESULT.found ? (
        <>
          <ItemPageHeader item={state.result.page.item} backTo={back.to} backLabel={back.label} />
          <ItemStatsBlock item={state.result.page.item} facts={state.result.page.facts} />
          <ItemHowToGet page={state.result.page} faction={faction} zoneId={zoneId} level={level} />
          <ItemPageFootnote faction={faction} clientBuild={state.result.page.clientBuild} />
        </>
      ) : null}
    </div>
  );
}
