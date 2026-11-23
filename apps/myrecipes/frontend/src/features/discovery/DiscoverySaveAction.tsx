import { Link } from "react-router-dom";
import { Button } from "@platform/ui";

interface Props {
  /** The recipe this result was already saved as, if it was. */
  savedRecipeId: string | undefined;
  onSave: () => void;
}

/**
 * Save a read result to my recipes, as the phone does. Once saved, it opens that recipe instead,
 * so the same result isn't saved twice.
 */
export default function DiscoverySaveAction({ savedRecipeId, onSave }: Props) {
  if (savedRecipeId) {
    return (
      <Link
        to={`/recipes/${savedRecipeId}`}
        className="inline-flex min-h-[44px] items-center rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
      >
        Open saved recipe
      </Link>
    );
  }
  return <Button onClick={onSave}>Save to my recipes</Button>;
}
