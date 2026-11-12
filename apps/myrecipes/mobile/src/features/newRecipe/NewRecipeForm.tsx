import { draftNeedsReview } from "@myrecipes/api-client/utils/draftNeedsReview";
import { Banner, LoadingButton, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useHeaderHeight } from "expo-router/react-navigation";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { NewRecipeSeed } from "../../types/NewRecipeSeed";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";
import IngredientRowEditor from "./IngredientRowEditor";
import RecipeDetailsFields from "./RecipeDetailsFields";
import SectionProblem from "./SectionProblem";
import StepRowEditor from "./StepRowEditor";
import { useNewRecipeForm } from "./useNewRecipeForm";

/** The new-recipe form: the recipe's fields, its ingredients and steps, then Create. */
export default function NewRecipeForm({ seed }: { seed?: NewRecipeSeed }) {
  const { colors, spacing } = useTheme();
  const form = useNewRecipeForm(seed);
  // The stack's header sits over the screen, so the keyboard's lift has to clear it too.
  const headerHeight = useHeaderHeight();
  const locked = form.isSaving || form.isLeaving;
  useDiscardPrompt(form.isDirty && !form.isLeaving, form.isSaving);
  const { ingredients, steps } = form.values;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        testID="new-recipe"
      >
        {seed && draftNeedsReview(seed.draft) ? <Banner message={MESSAGES.draftNeedsReview} /> : null}
        <RecipeDetailsFields
          disabled={locked}
          focusTitle={seed != null && seed.draft.title.trim() === ""}
          onEdit={form.edit}
          problems={form.problems}
          values={form.values}
        />

        <RecipeSectionHeading>{MESSAGES.ingredientsHeading}</RecipeSectionHeading>
        <SectionProblem message={form.problems.ingredients} />
        {ingredients.map((row, index) => (
          <IngredientRowEditor
            disabled={locked}
            isLast={index === ingredients.length - 1}
            isNew={row.key === form.addedKey}
            key={row.key}
            number={index + 1}
            onChange={form.editIngredient}
            onMove={form.moveIngredient}
            onRemove={form.removeIngredient}
            problems={form.problems.rows[row.key]}
            row={row}
          />
        ))}
        <LoadingButton disabled={locked} onPress={form.addIngredient} variant="secondary">
          {MESSAGES.addIngredient}
        </LoadingButton>

        <RecipeSectionHeading>{MESSAGES.stepsHeading}</RecipeSectionHeading>
        <SectionProblem message={form.problems.steps} />
        {steps.map((row, index) => (
          <StepRowEditor
            disabled={locked}
            isLast={index === steps.length - 1}
            isNew={row.key === form.addedKey}
            key={row.key}
            number={index + 1}
            onChange={form.editStep}
            onMove={form.moveStep}
            onRemove={form.removeStep}
            problem={form.problems.stepRows[row.key]}
            row={row}
          />
        ))}
        <LoadingButton disabled={locked} onPress={form.addStep} variant="secondary">
          {MESSAGES.addStep}
        </LoadingButton>

        <LoadingButton disabled={form.isLeaving} isLoading={form.isSaving} loadingText={MESSAGES.creating} onPress={form.save}>
          {MESSAGES.create}
        </LoadingButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
