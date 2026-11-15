import { useState } from "react";
import { LoadingButton, Button, FormField } from "@platform/ui";
import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";

interface Props {
  recipe: RecipeDetailResponse;
  isLoading: boolean;
  onSubmit: (values: RecipeMetaValues) => void;
  onCancel: () => void;
}

/** The title / description / source fields, seeded from `recipe` when it mounts. */
export default function EditRecipeMetaForm({ recipe, isLoading, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description ?? "");
  const [source, setSource] = useState(recipe.source ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ title, description, source });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <FormField label="Title" required>
        {(field) => (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLoading}
            required
            maxLength={RECIPE_TITLE_MAX_LENGTH}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]"
            {...field}
          />
        )}
      </FormField>

      <FormField label="Description">
        {(field) => (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading}
            rows={3}
            maxLength={RECIPE_DESCRIPTION_MAX_LENGTH}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            {...field}
          />
        )}
      </FormField>

      <FormField label="Source">
        {(field) => (
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={isLoading}
            maxLength={RECIPE_SOURCE_MAX_LENGTH}
            placeholder="e.g. grandma, a cookbook, a URL"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]"
            {...field}
          />
        )}
      </FormField>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <LoadingButton
          type="submit"
          size="sm"
          isLoading={isLoading}
          loadingText="Saving..."
          disabled={!title.trim()}
        >
          Save changes
        </LoadingButton>
      </div>
    </form>
  );
}
