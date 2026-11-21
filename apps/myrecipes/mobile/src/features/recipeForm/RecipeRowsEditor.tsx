import { LoadingButton, useFieldChain } from "@platform/mobile";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { IngredientFieldKey } from "../../types/IngredientFieldKey";
import type { RecipeRowsEditorProps } from "../../types/RecipeRowsEditorProps";
import { ingredientFieldKey } from "../../utils/ingredientFieldKey";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";
import IngredientRowEditor from "./IngredientRowEditor";
import SectionProblem from "./SectionProblem";
import StepRowEditor from "./StepRowEditor";

/** A recipe form's ingredients and steps, each with its problems and a button to add another. */
export default function RecipeRowsEditor({ values, problems, rows, disabled }: RecipeRowsEditorProps) {
  const { ingredients, steps } = values;
  // Return moves through each ingredient's fields and on to the next ingredient's name.
  const fields = useFieldChain<IngredientFieldKey>(
    ingredients.flatMap((row) => [ingredientFieldKey(row.key, "name"), ingredientFieldKey(row.key, "quantity"), ingredientFieldKey(row.key, "unit"), ingredientFieldKey(row.key, "note")]),
  );

  return (
    <>
      <RecipeSectionHeading>{MESSAGES.ingredientsHeading}</RecipeSectionHeading>
      <SectionProblem message={problems.ingredients} section={MESSAGES.ingredientsHeading} />
      {ingredients.map((row, index) => (
        <IngredientRowEditor
          disabled={disabled}
          fields={fields}
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
      <SectionProblem message={problems.steps} section={MESSAGES.stepsHeading} />
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
