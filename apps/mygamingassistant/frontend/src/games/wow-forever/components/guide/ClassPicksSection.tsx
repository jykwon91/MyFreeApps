import ClassPickCard from "@/games/wow-forever/components/guide/ClassPickCard";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { CLASS_PICKS } from "@/games/wow-forever/data/guide/classPicks";

export default function ClassPicksSection() {
  return (
    <GuideSection
      id="classes"
      title="Pick a class"
      intro="All nine classes can reach level 60 and do everything. If this is your first time, Mage or Paladin is the easiest start. Class details are from Classic Era — Forever is reworking talents, so some of this may change."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CLASS_PICKS.map((pick) => (
          <ClassPickCard key={pick.classId} pick={pick} />
        ))}
      </div>
    </GuideSection>
  );
}
