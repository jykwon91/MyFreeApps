import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@platform/ui";
import CompareDisclaimer from "@/games/wow-forever/components/compare/CompareDisclaimer";
import CompareResultPanel from "@/games/wow-forever/components/compare/CompareResultPanel";
import CompareSettingsBar from "@/games/wow-forever/components/compare/CompareSettingsBar";
import ItemCard from "@/games/wow-forever/components/compare/ItemCard";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useCompareItems, MAX_COMPARE_ITEMS } from "@/games/wow-forever/hooks/useCompareItems";
import { useCompareSettings } from "@/games/wow-forever/hooks/useCompareSettings";
import { compareItems } from "@/games/wow-forever/scoring/compareItems";
import { describeWeights } from "@/games/wow-forever/scoring/describeWeights";

/** /wow-forever/compare — score 2+ items for a class/spec. Nothing is saved except the settings. */
export default function WowComparePage() {
  const [settings, updateSettings] = useCompareSettings();
  const { items, addItem, removeItem, replaceItem, canAdd, canRemove } = useCompareItems();
  const result = useMemo(() => compareItems(items, settings), [items, settings]);

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-6xl">
      <WowPageHeader
        title="Item Compare"
        subtitle="Paste or screenshot two or more items to see which is better for your class and spec."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <CompareSettingsBar settings={settings} onChange={updateSettings} />
      <CompareDisclaimer />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            position={i + 1}
            canRemove={canRemove}
            onChange={replaceItem}
            onRemove={removeItem}
          />
        ))}
      </div>
      {canAdd ? (
        <Button variant="secondary" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1 inline" aria-hidden />
          Add another item (up to {MAX_COMPARE_ITEMS})
        </Button>
      ) : null}
      <CompareResultPanel result={result} weightsLabel={describeWeights(settings, result.weightSource)} />
    </main>
  );
}
