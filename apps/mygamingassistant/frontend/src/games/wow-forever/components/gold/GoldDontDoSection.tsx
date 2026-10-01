import { Button } from "@platform/ui";
import ChecklistRow from "@/games/wow-forever/components/guide/ChecklistRow";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { GOLD_DONT_DO } from "@/games/wow-forever/data/gold/goldTips";
import { useChecklist } from "@/games/wow-forever/hooks/useChecklist";

export const GOLD_CHECKLIST_STORAGE_KEY = "mga.wowForever.gold.checklist.v1";

const IDS = GOLD_DONT_DO.map((m) => m.id);

/** Mistakes that lose gold — tick them off once you've got them. */
export default function GoldDontDoSection() {
  const { checked, toggle, reset } = useChecklist(IDS, GOLD_CHECKLIST_STORAGE_KEY);
  return (
    <GuideSection id="dont" title="Things not to do" intro="Tick these off as you go — your progress is saved in this browser.">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium" aria-live="polite">
          {checked.size} of {GOLD_DONT_DO.length} done
        </p>
        <Button variant="ghost" size="sm" onClick={reset} disabled={checked.size === 0}>
          Reset
        </Button>
      </div>
      <ul className="space-y-2">
        {GOLD_DONT_DO.map((item) => (
          <ChecklistRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={toggle} />
        ))}
      </ul>
    </GuideSection>
  );
}
