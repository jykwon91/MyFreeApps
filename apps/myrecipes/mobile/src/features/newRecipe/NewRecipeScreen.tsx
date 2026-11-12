import { useSession } from "@platform/mobile";
import { useLocalSearchParams } from "expo-router";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import SignInPrompt from "../account/SignInPrompt";
import NewRecipeForm from "./NewRecipeForm";
import NewRecipeFromDiscovery from "./NewRecipeFromDiscovery";

/**
 * Creating a recipe needs an account, as on the website, which asks a signed-out visitor to sign
 * in. Signing in comes back here, to the form. Opened with a `discovery` result id, the form is
 * filled in from that recipe for the user to review, as the website's editor is.
 */
export default function NewRecipeScreen() {
  const { state } = useSession();
  const { discovery } = useLocalSearchParams<{ discovery?: string }>();

  // Keyed so another account starts with an empty form.
  if (state.status === "signedIn") {
    return discovery ? <NewRecipeFromDiscovery key={state.email} resultId={discovery} /> : <NewRecipeForm key={state.email} />;
  }
  return <SignInPrompt body={MESSAGES.signInBody} heading={MESSAGES.signInHeading} skeletonTestID="new-recipe-skeleton" />;
}
