import { useMemo } from "react";
import GoalPlanSection from "@/games/wow-forever/components/goalPlanner/GoalPlanSection";
import ProfessionGoalCard from "@/games/wow-forever/components/goalPlanner/ProfessionGoalCard";
import ProfessionGoalPicker from "@/games/wow-forever/components/goalPlanner/ProfessionGoalPicker";
import RecipeGoalPicker from "@/games/wow-forever/components/goalPlanner/RecipeGoalPicker";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useGoalPlan } from "@/games/wow-forever/hooks/useGoalPlan";
import { useGoalPlannerGoals } from "@/games/wow-forever/hooks/useGoalPlannerGoals";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useRecipeBook } from "@/games/wow-forever/hooks/useRecipeBook";

/** /wow-forever/goal-planner — profession and recipe goals worked into one ordered route. */
export default function WowGoalPlannerPage() {
  useDocumentTitle(GOAL_PLANNER_TEXT.documentTitle);
  const [player, updatePlayer] = usePlayerSettings();
  const book = useRecipeBook();
  const { goals, addProfession, removeProfession, setGoal, addRecipe, removeRecipe } = useGoalPlannerGoals();
  const plan = useGoalPlan(goals, book);
  const chosen = useMemo(() => new Set(goals.professions.map((g) => g.profession)), [goals.professions]);
  const hasGoals = goals.professions.length > 0 || goals.recipes.length > 0;

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader title={GOAL_PLANNER_TEXT.title} subtitle={GOAL_PLANNER_TEXT.subtitle} backTo="/wow-forever" backLabel={GOAL_PLANNER_TEXT.back} />
      <SegmentedToggle
        label={GOAL_PLANNER_TEXT.factionLabel}
        options={PLAYER_FACTION_OPTIONS}
        value={player.faction}
        onChange={(faction) => updatePlayer({ faction })}
      />
      <section className="space-y-3" aria-labelledby="goal-professions-heading">
        <h2 id="goal-professions-heading" className="text-lg font-semibold">
          {GOAL_PLANNER_TEXT.professionsHeading}
        </h2>
        {goals.professions.length ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {goals.professions.map((goal) => (
              <ProfessionGoalCard
                key={goal.profession}
                goal={goal}
                onChange={(change) => setGoal(goal.profession, change)}
                onRemove={() => removeProfession(goal.profession)}
              />
            ))}
          </ul>
        ) : null}
        <ProfessionGoalPicker chosen={chosen} onAdd={addProfession} />
      </section>
      <RecipeGoalPicker book={book} chosen={goals.recipes} onAdd={addRecipe} onRemove={removeRecipe} />
      <GoalPlanSection hasGoals={hasGoals} state={plan} faction={player.faction} />
    </div>
  );
}
