import * as Dialog from "@radix-ui/react-dialog";
import { useRestoreFocusOnClose } from "@platform/ui";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import EditRecipeMetaDialog from "@/features/recipes/EditRecipeMetaDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  recipe: RecipeDetailResponse;
}

/**
 * Edits recipe-level metadata (title / description / source). Ingredients and
 * steps are intentionally NOT editable here — changing those is a tweak (a new
 * version), per the backend contract where PATCH only accepts these three
 * fields. The dialog's body mounts with each open, so every open starts from
 * the recipe as it is now (not a stale or abandoned edit). On close, focus goes
 * back to what opened it.
 */
export default function EditRecipeMetaModal({ open, onClose, recipe }: Props) {
  const restoreFocus = useRestoreFocusOnClose(open);
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <EditRecipeMetaDialog recipe={recipe} onClose={onClose} onCloseAutoFocus={restoreFocus} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
