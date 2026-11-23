import { LoadingButton, Button, FormField } from "@platform/ui";
import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";

interface Props {
  values: RecipeMetaValues;
  isLoading: boolean;
  onEdit: (field: keyof RecipeMetaValues, text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/** The title / description / source fields. */
export default function EditRecipeMetaForm({ values, isLoading, onEdit, onSubmit, onCancel }: Props) {
  const { title, description, source } = values;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <FormField label="Title" required>
        {(field) => (
          <input
            type="text"
            value={title}
            onChange={(e) => onEdit("title", e.target.value)}
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
            onChange={(e) => onEdit("description", e.target.value)}
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
            onChange={(e) => onEdit("source", e.target.value)}
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
