import { Thumbnail } from "@platform/mobile";
import { Text, useWindowDimensions, View } from "react-native";
import { photoViewerPageLabel, WELCOME_MANUAL_PHOTO_VIEWER_MESSAGES as MESSAGES, WELCOME_MANUAL_PHOTO_VIEWER_STYLE as STYLE } from "../../constants/welcomeManualPhotoViewer";
import type { WelcomeManualPhotoViewerPageProps } from "../../types/WelcomeManualPhotoViewerPageProps";

/** One full-screen page of the viewer: the photo, or a line saying it's missing, and its caption. */
export default function WelcomeManualPhotoViewerPage({ image, index, total, width, onRetry }: WelcomeManualPhotoViewerPageProps) {
  const { height } = useWindowDimensions();
  const isAvailable = Boolean(image.presigned_url) && image.is_available !== false;
  const label = photoViewerPageLabel(index, total, image.caption);
  return (
    <View accessible accessibilityLabel={label} style={{ width, height, justifyContent: "center" }}>
      {isAvailable ? (
        <Thumbnail accessibilityIgnoresInvertColors failedMessage={MESSAGES.couldntLoad} failedColors={{ text: STYLE.mutedOnBackdrop, background: STYLE.backdrop }} onRetry={onRetry} resizeMode="contain" source={{ uri: image.presigned_url ?? undefined }} testID="welcome-manual-photo-image" style={{ width, height: height * 0.7 }} />
      ) : (
        <Text style={{ textAlign: "center", color: STYLE.mutedOnBackdrop }}>{MESSAGES.unavailable}</Text>
      )}
      <Text style={{ padding: 16, textAlign: "center", color: image.caption ? STYLE.onBackdrop : STYLE.mutedOnBackdrop }}>{image.caption ?? MESSAGES.noCaption}</Text>
    </View>
  );
}
