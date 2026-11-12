import { useConfirmLeave, useTheme } from "@platform/mobile";
import { Alert, ScrollView } from "react-native";
import { IMPORT_RECIPE_MESSAGES as MESSAGES } from "../../constants/importRecipe";
import NewRecipeForm from "../newRecipe/NewRecipeForm";
import PhotoChooser from "./PhotoChooser";
import PhotoPreview from "./PhotoPreview";
import ReadingPhoto from "./ReadingPhoto";
import { usePhotoImport } from "./usePhotoImport";

/**
 * Pick a photo, check it, have it read, then review what was read in the new-recipe form and
 * create it, all on one screen as on the website: the draft can't be rebuilt from a link.
 */
export default function PhotoImportFlow() {
  const { colors, spacing } = useTheme();
  const { state, picking, choose, chooseAgain, extract } = usePhotoImport();

  // The website warns before a tab close abandons a read; here Back or a swipe asks first.
  useConfirmLeave(state.step === "reading", (leave) => {
    Alert.alert(MESSAGES.stopTitle, MESSAGES.stopBody, [
      { text: MESSAGES.keepWaiting, style: "cancel" },
      { text: MESSAGES.leave, style: "destructive", onPress: leave },
    ]);
  });

  if (state.step === "review") return <NewRecipeForm seed={{ draft: state.draft, origin: "photo" }} />;

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, gap: spacing.md, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="import-recipe"
    >
      {state.step === "choose" ? <PhotoChooser onChoose={choose} picking={picking} problem={state.problem} /> : null}
      {state.step === "preview" ? (
        <PhotoPreview onChooseAgain={chooseAgain} onExtract={extract} photo={state.photo} problem={state.problem} />
      ) : null}
      {state.step === "reading" ? <ReadingPhoto photo={state.photo} startedAt={state.startedAt} /> : null}
    </ScrollView>
  );
}
