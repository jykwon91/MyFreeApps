import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { Image } from "react-native";
import { IMPORT_RECIPE_MESSAGES as MESSAGES, RECIPE_PHOTO_PREVIEW_HEIGHT } from "../../constants/importRecipe";
import type { PhotoPreviewProps } from "../../types/PhotoPreviewProps";

/** The photo picked, to check before it's read, as the website previews the file chosen. */
export default function PhotoPreview({ photo, problem, onExtract, onChooseAgain }: PhotoPreviewProps) {
  const { colors, radius } = useTheme();

  return (
    <>
      {problem ? <Banner message={problem} /> : null}
      <Image
        accessibilityLabel={MESSAGES.previewLabel}
        accessible
        resizeMode="contain"
        source={{ uri: photo.uri }}
        style={{ height: RECIPE_PHOTO_PREVIEW_HEIGHT, borderRadius: radius.md, backgroundColor: colors.muted }}
      />
      <LoadingButton onPress={onExtract}>{MESSAGES.extract}</LoadingButton>
      <LoadingButton onPress={onChooseAgain} variant="secondary">
        {MESSAGES.chooseDifferent}
      </LoadingButton>
    </>
  );
}
