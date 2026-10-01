import { Select } from "@platform/ui";
import GoldTipList from "@/games/wow-forever/components/gold/GoldTipList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { findClass, WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { CLASS_GOLD_TIPS } from "@/games/wow-forever/data/gold/goldTips";

const ALL_CLASSES = "all";

interface GoldClassSectionProps {
  classId: WowClassId;
  showAll: boolean;
  onClassChange: (classId: WowClassId) => void;
  onShowAll: () => void;
}

/** Money tricks for your class, or every class. Picking a class saves it as yours (shared with the World Map). */
export default function GoldClassSection({ classId, showAll, onClassChange, onShowAll }: GoldClassSectionProps) {
  const shown = showAll ? CLASS_GOLD_TIPS : CLASS_GOLD_TIPS.filter((c) => c.classId === classId);
  return (
    <GuideSection id="class" title="Your class" intro="Every class has something it does better than the others.">
      <div className="space-y-1">
        <label htmlFor="gold-class" className="text-sm font-medium">
          Class
        </label>
        <div>
          <Select
            id="gold-class"
            value={showAll ? ALL_CLASSES : classId}
            onChange={(e) => {
              const cls = findClass(e.target.value);
              if (cls) onClassChange(cls.id);
              else onShowAll();
            }}
            className="min-h-[44px] bg-card"
          >
            {WOW_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={ALL_CLASSES}>All classes</option>
          </Select>
        </div>
      </div>
      {shown.map((c) => (
        <div key={c.classId} className="space-y-2">
          {showAll ? <h3 className="font-semibold">{findClass(c.classId)?.name}</h3> : null}
          <GoldTipList tips={c.tips} />
        </div>
      ))}
    </GuideSection>
  );
}
