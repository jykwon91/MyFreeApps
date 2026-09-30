import { useMemo } from "react";
import FoodDataNote from "@/games/wow-forever/components/food/FoodDataNote";
import FoodEmptyState from "@/games/wow-forever/components/food/FoodEmptyState";
import FoodNextUpgrade from "@/games/wow-forever/components/food/FoodNextUpgrade";
import FoodPickerInputs from "@/games/wow-forever/components/food/FoodPickerInputs";
import FoodResultStatus from "@/games/wow-forever/components/food/FoodResultStatus";
import FoodRunnersUp from "@/games/wow-forever/components/food/FoodRunnersUp";
import FoodTopPick from "@/games/wow-forever/components/food/FoodTopPick";
import FoodTrainTarget from "@/games/wow-forever/components/food/FoodTrainTarget";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { findClass, findSpec } from "@/games/wow-forever/data/classes";
import { FOODS, TRAINER_SKILLS } from "@/games/wow-forever/data/food/foodData";
import { ACTIVITY_PHRASE } from "@/games/wow-forever/food/foodActivities";
import { rankFoods } from "@/games/wow-forever/food/rankFoods";
import { useFoodPickerSettings, type FoodPickerSettings } from "@/games/wow-forever/hooks/useFoodPickerSettings";

/** "a level 35 Fury Warrior" / "a level 35 Warrior". */
function describeWho(settings: FoodPickerSettings, level: number): string {
  const cls = findClass(settings.classId)?.name ?? "";
  const spec = findSpec(settings.classId, settings.specId)?.name;
  return spec ? `a level ${level} ${spec} ${cls}` : `a level ${level} ${cls}`;
}

/** /wow-forever/food — the best food to cook for your level, class and what you're doing. */
export default function WowFoodPickerPage() {
  const [settings, update] = useFoodPickerSettings();
  const { level, activity, cookingSkill } = settings;
  const result = useMemo(
    () => (level === null ? null : rankFoods(FOODS, { ...settings, level }, TRAINER_SKILLS)),
    [settings, level],
  );
  const who = level === null ? "" : describeWho(settings, level);

  let status = "Enter your level to see the best food.";
  if (result?.top) status = `Best pick: ${result.top.food.name}.`;
  else if (result) status = "Nothing fits yet.";

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title="What should I eat?"
        subtitle="The best food to cook for your level, class and what you're doing."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <FoodPickerInputs settings={settings} onChange={update} />
      <FoodResultStatus message={status} />

      {result === null || level === null ? (
        <FoodEmptyState message="Enter your level to see what to cook." />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Best food for {who} {ACTIVITY_PHRASE[activity]}
            {cookingSkill === null ? "" : ` with Cooking ${cookingSkill}`}.
          </p>
          {result.top ? (
            <FoodTopPick pick={result.top} activity={activity} who={who} />
          ) : (
            <FoodEmptyState message="Nothing you can eat at this level helps with that yet." />
          )}
          {result.trainFor && cookingSkill !== null ? (
            <FoodTrainTarget pick={result.trainFor} cookingSkill={cookingSkill} activity={activity} />
          ) : null}
          {result.nextUpgrade ? <FoodNextUpgrade level={result.nextUpgrade.level} pick={result.nextUpgrade.pick} /> : null}
          <FoodRunnersUp key={`${activity}/${level}`} picks={result.runnersUp} activity={activity} />
          <FoodDataNote weightsLabel={result.weights.label} />
        </div>
      )}
    </main>
  );
}
