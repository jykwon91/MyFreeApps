import { VERSION_COPY } from "../constants/versions";
import { requestErrorStatus } from "./requestErrorStatus";

/** What to tell the user when a comparison of two versions can't be loaded. */
export function diffErrorMessage(error: unknown): string {
  switch (requestErrorStatus(error)) {
    // `against` isn't a version of this recipe.
    case 400:
      return VERSION_COPY.notInRecipe;
    case 404:
      return VERSION_COPY.recipeOrVersionGone;
    // An id in the link isn't one at all.
    case 422:
      return VERSION_COPY.invalidLink;
    default:
      return VERSION_COPY.loadFailedBody;
  }
}
