import { FieldFeedback } from "@platform/ui";
import type { IngredientRowProblems } from "@myrecipes/api-client/types/recipe/ingredient-row-problems";
import { ingredientControlId } from "@/features/recipes/rowControlIds";

interface Props {
  rowKey: string;
  problems: IngredientRowProblems | undefined;
}

/** What's wrong with an ingredient row's fields, in the order they sit on the row. */
export default function IngredientRowFeedback({ rowKey, problems }: Props) {
  if (!problems) return null;
  return (
    <>
      <FieldFeedback id={ingredientControlId(rowKey, "name")} error={problems.name} />
      <FieldFeedback id={ingredientControlId(rowKey, "quantity")} error={problems.quantity} />
      <FieldFeedback id={ingredientControlId(rowKey, "unit")} error={problems.unit} />
      <FieldFeedback id={ingredientControlId(rowKey, "note")} error={problems.note} />
    </>
  );
}
