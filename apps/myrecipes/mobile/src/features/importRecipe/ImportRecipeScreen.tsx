import { useSession } from "@platform/mobile";
import { IMPORT_RECIPE_MESSAGES as MESSAGES } from "../../constants/importRecipe";
import SignInPrompt from "../account/SignInPrompt";
import PhotoImportFlow from "./PhotoImportFlow";

/** Importing a recipe from a photo needs an account, as the website's /recipes/import does. */
export default function ImportRecipeScreen() {
  const { state } = useSession();

  // Keyed so another account signing in drops this one's photo and any read still running.
  if (state.status === "signedIn") return <PhotoImportFlow key={state.email} />;
  return <SignInPrompt body={MESSAGES.signInBody} heading={MESSAGES.signInHeading} skeletonTestID="import-recipe-skeleton" />;
}
