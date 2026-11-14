import { Image, Text, useWindowDimensions, View } from "react-native";
import { photoViewerPageLabel, WELCOME_MANUAL_PHOTO_VIEWER_MESSAGES as MESSAGES, WELCOME_MANUAL_PHOTO_VIEWER_STYLE as STYLE } from "../../constants/welcomeManualPhotoViewer";
import type { WelcomeManualPhotoViewerPageProps } from "../../types/WelcomeManualPhotoViewerPageProps";

/** One full-screen page of the viewer: the photo, or a line saying it's missing, and its caption. */
export default function WelcomeManualPhotoViewerPage({ image, index, total, width }: WelcomeManualPhotoViewerPageProps) {
  const { height } = useWindowDimensions();
  const isAvailable = Boolean(image.presigned_url) && image.is_available !== false;
  const label = photoViewerPageLabel(index, total, image.caption);
  return (
    <View accessible accessibilityLabel={label} style={{ width, height, justifyContent: "center" }}>
      {isAvailable ? (
        <Image accessibilityIgnoresInvertColors resizeMode="contain" source={{ uri: image.presigned_url ?? undefined }} style={{ width, height: height * 0.7 }} />
      ) : (
        <Text style={{ textAlign: "center", color: STYLE.mutedOnBackdrop }}>{MESSAGES.unavailable}</Text>
      )}
      <Text style={{ padding: 16, textAlign: "center", color: image.caption ? STYLE.onBackdrop : STYLE.mutedOnBackdrop }}>{image.caption ?? MESSAGES.noCaption}</Text>
    </View>
  );
}
