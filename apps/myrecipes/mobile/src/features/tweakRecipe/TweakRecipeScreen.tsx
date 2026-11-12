import { useSession } from "@platform/mobile";
import { useLocalSearchParams } from "expo-router";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../constants/tweakRecipe";
import SignInPrompt from "../account/SignInPrompt";
import TweakRecipeLoader from "./TweakRecipeLoader";

/**
 * Tweaking a recipe needs an account, as on the website, which asks a signed-out visitor to sign
 * in. Signing in comes back here, to the form.
 */
export default function TweakRecipeScreen() {
  const { state } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Keyed so another account starts over, and a save still on its way for the last one is dropped.
  if (state.status === "signedIn") return <TweakRecipeLoader key={state.email} recipeId={id} />;
  return <SignInPrompt body={MESSAGES.signInBody} heading={MESSAGES.signInHeading} skeletonTestID="tweak-recipe-session-skeleton" />;
}
