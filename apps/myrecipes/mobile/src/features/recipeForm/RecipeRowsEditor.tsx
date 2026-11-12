import { LoadingButton } from "@platform/mobile";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { RecipeRowsEditorProps } from "../../types/RecipeRowsEditorProps";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";
import IngredientRowEditor from "./IngredientRowEditor";
import SectionProblem from "./SectionProblem";
import StepRowEditor from "./StepRowEditor";

/** A recipe form's ingredients and steps, each with its problems and a button to add another. */
export default function RecipeRowsEditor({ values, problems, rows, disabled }: RecipeRowsEditorProps) {
  const { ingredients, steps } = values;

  return (
    <>
      <RecipeSectionHeading>{MESSAGES.ingredientsHeading}</RecipeSectionHeading>
      <SectionProblem message={problems.ingredients} />
      {ingredients.map((row, index) => (
        <IngredientRowEditor
          disabled={disabled}
          isLast={index === ingredients.length - 1}
          isNew={row.key === rows.addedKey}
          key={row.key}
          number={index + 1}
          onChange={rows.editIngredient}
          onMove={rows.moveIngredient}
          onRemove={rows.removeIngredient}
          problems={problems.rows[row.key]}
          row={row}
        />
      ))}
      <LoadingButton disabled={disabled} onPress={rows.addIngredient} variant="secondary">
        {MESSAGES.addIngredient}
      </LoadingButton>

      <RecipeSectionHeading>{MESSAGES.stepsHeading}</RecipeSectionHeading>
      <SectionProblem message={problems.steps} />
      {steps.map((row, index) => (
        <StepRowEditor
          disabled={disabled}
          isLast={index === steps.length - 1}
          isNew={row.key === rows.addedKey}
          key={row.key}
          number={index + 1}
          onChange={rows.editStep}
          onMove={rows.moveStep}
          onRemove={rows.removeStep}
          problem={problems.stepRows[row.key]}
          row={row}
        />
      ))}
      <LoadingButton disabled={disabled} onPress={rows.addStep} variant="secondary">
        {MESSAGES.addStep}
      </LoadingButton>
    </>
  );
}
