import GoldTipList from "@/games/wow-forever/components/gold/GoldTipList";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { CLASS_GOLD_TIPS } from "@/games/wow-forever/data/gold/goldTips";
import { classIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import ClassSelect from "@/games/wow-forever/components/shared/ClassSelect";

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
        <div className="max-w-xs">
          <ClassSelect
            id="gold-class"
            value={showAll ? null : classId}
            onChange={onClassChange}
            allOption={{ label: "All classes", onSelect: onShowAll }}
          />
        </div>
      </div>
      {shown.map((c) => (
        <div key={c.classId} className="space-y-2">
          {showAll ? (
            <h3 className="flex items-center gap-2 font-semibold">
              <GameIcon icon={classIcon(c.classId)} size={24} alt="" />
              {findClass(c.classId)?.name}
            </h3>
          ) : null}
          <GoldTipList tips={c.tips} />
        </div>
      ))}
    </GuideSection>
  );
}
