import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { Linking, Text } from "react-native";
import { IMPORT_RECIPE_MESSAGES as MESSAGES } from "../../constants/importRecipe";
import type { PhotoChooserProps } from "../../types/PhotoChooserProps";

/** Where the website has its file dropzone: the camera, or a photo from the library. */
export default function PhotoChooser({ problem, picking, onChoose }: PhotoChooserProps) {
  const { colors, fontSize } = useTheme();
  const router = useRouter();
  const settingsAction = { label: MESSAGES.openSettings, onPress: () => void Linking.openSettings() };

  return (
    <>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.intro}</Text>
      {problem ? <Banner actions={problem.needsSettings ? [settingsAction] : []} message={problem.message} /> : null}
      <LoadingButton
        disabled={picking === "library"}
        isLoading={picking === "camera"}
        loadingText={MESSAGES.gettingPhoto}
        onPress={() => onChoose("camera")}
      >
        {MESSAGES.takePhoto}
      </LoadingButton>
      <LoadingButton
        disabled={picking === "camera"}
        isLoading={picking === "library"}
        loadingText={MESSAGES.gettingPhoto}
        onPress={() => onChoose("library")}
        variant="secondary"
      >
        {MESSAGES.choosePhoto}
      </LoadingButton>
      <LoadingButton disabled={picking !== null} onPress={() => router.replace("/recipes/new")} variant="ghost">
        {MESSAGES.typeItIn}
      </LoadingButton>
    </>
  );
}
