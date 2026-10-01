import { useState } from "react";
import GoldTipList from "@/games/wow-forever/components/gold/GoldTipList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { CLASS_GOLD_TIPS } from "@/games/wow-forever/data/gold/goldTips";

const SCOPE = { mine: "mine", all: "all" } as const;
type Scope = (typeof SCOPE)[keyof typeof SCOPE];

/** Money tricks for your class (the one saved on the World Map), or every class. */
export default function GoldClassSection({ classId }: { classId: WowClassId }) {
  const [scope, setScope] = useState<Scope>(SCOPE.mine);
  const className = findClass(classId)?.name ?? classId;
  const shown = scope === SCOPE.all ? CLASS_GOLD_TIPS : CLASS_GOLD_TIPS.filter((c) => c.classId === classId);
  return (
    <GuideSection id="class" title="Your class" intro="Every class has something it does better than the others.">
      <SegmentedToggle
        label="Class tips for"
        options={[
          { id: SCOPE.mine, label: className },
          { id: SCOPE.all, label: "All classes" },
        ]}
        value={scope}
        onChange={setScope}
      />
      {shown.map((c) => (
        <div key={c.classId} className="space-y-2">
          {scope === SCOPE.all ? <h3 className="font-semibold">{findClass(c.classId)?.name}</h3> : null}
          <GoldTipList tips={c.tips} />
        </div>
      ))}
    </GuideSection>
  );
}
