import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { UnsavedChangesDialog, showError, showSuccess, useUnsavedChangesGuard } from "@platform/ui";
import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import { sameFormValues } from "@platform/core/utils/sameFormValues";
import { RECIPE_MANAGE_MESSAGES as MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import { useUpdateRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";
import { buildRecipeUpdateRequest } from "@myrecipes/api-client/utils/buildRecipeUpdateRequest";
import { recipeMetaProblems } from "@myrecipes/api-client/utils/recipeMetaProblems";
import { recipeMetaValues } from "@myrecipes/api-client/utils/recipeMetaValues";
import { recipeWriteErrorMessage } from "@myrecipes/api-client/utils/recipeWriteErrorMessage";
import EditRecipeMetaForm from "@/features/recipes/EditRecipeMetaForm";
import type { EditRecipeMetaDialogProps } from "@/types/edit-recipe-meta-dialog-props";

/**
 * The edit dialog's body, holding what's typed. Escape, a click outside and Cancel close it
 * straight away when nothing changed, and ask first when something did, as the phone does.
 * A save in flight can't be walked away from.
 */
export default function EditRecipeMetaDialog({ recipe, onClose, onCloseAutoFocus }: EditRecipeMetaDialogProps) {
  const [updateRecipe, { isLoading }] = useUpdateRecipeMutation();
  const [initialValues] = useState(() => recipeMetaValues(recipe));
  const [values, setValues] = useState(initialValues);
  const guard = useUnsavedChangesGuard(!sameFormValues(values, initialValues), { isBusy: isLoading });

  function requestClose() {
    if (!isLoading) guard.requestLeave(onClose);
  }

  function edit(field: keyof RecipeMetaValues, text: string) {
    setValues((current) => ({ ...current, [field]: text }));
  }

  async function handleSubmit() {
    const problems = recipeMetaProblems(values);
    const problem = problems.title ?? problems.description ?? problems.source;
    if (problem) {
      showError(problem);
      return;
    }
    try {
      await updateRecipe({ recipeId: recipe.id, body: buildRecipeUpdateRequest(values) }).unwrap();
      showSuccess(MESSAGES.updated);
      guard.leaveWithoutAsking(onClose);
    } catch (error) {
      const message = recipeWriteErrorMessage(error, "update");
      if (message) showError(message);
    }
  }

  return (
    <>
      <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
      <Dialog.Content
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg"
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          requestClose();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
          requestClose();
        }}
      >
        <Dialog.Title className="text-base font-semibold">{MESSAGES.editTitle}</Dialog.Title>
        <Dialog.Description className="text-sm text-muted-foreground mt-1">
          {MESSAGES.editIntro}
        </Dialog.Description>

        <EditRecipeMetaForm
          values={values}
          isLoading={isLoading}
          onEdit={edit}
          onSubmit={handleSubmit}
          onCancel={requestClose}
        />
        <UnsavedChangesDialog
          open={guard.isAsking}
          copy={DISCARD_MESSAGES}
          onKeepEditing={guard.keepEditing}
          onDiscard={guard.discard}
        />
      </Dialog.Content>
    </>
  );
}
