import { Button } from "@platform/ui";
import ChecklistRow from "@/games/wow-forever/components/guide/ChecklistRow";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { BEGINNER_MISTAKES } from "@/games/wow-forever/data/guide/beginnerMistakes";
import { useChecklist } from "@/games/wow-forever/hooks/useChecklist";

const MISTAKE_IDS = BEGINNER_MISTAKES.map((m) => m.id);

export default function BeginnerChecklistSection() {
  const { checked, toggle, reset } = useChecklist(MISTAKE_IDS);
  return (
    <GuideSection
      id="mistakes"
      title="Mistakes to avoid"
      intro="Tick these off as you go — your progress is saved in this browser."
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium" aria-live="polite">
          {checked.size} of {BEGINNER_MISTAKES.length} done
        </p>
        <Button variant="ghost" size="sm" onClick={reset} disabled={checked.size === 0}>
          Reset
        </Button>
      </div>
      <ul className="space-y-2">
        {BEGINNER_MISTAKES.map((item) => (
          <ChecklistRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={toggle} />
        ))}
      </ul>
    </GuideSection>
  );
}
