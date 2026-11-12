import { PHOTO_IMPORT_COPY as COPY, PHOTO_IMPORT_TIME_HINT_DELAY_MS } from "@myrecipes/api-client/constants/photoImport";
import { useAnnouncement, useTheme } from "@platform/mobile";
import { useKeepAwake } from "expo-keep-awake";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { IMPORT_RECIPE_MESSAGES as MESSAGES, RECIPE_PHOTO_THUMBNAIL_SIZE } from "../../constants/importRecipe";
import { useTicker } from "../../hooks/useTicker";
import type { ReadingPhotoProps } from "../../types/ReadingPhotoProps";

/**
 * While the photo is read: one request of up to ~30s, which can't be stopped server-side, so as on
 * the website there's no Cancel, only leaving. The screen stays awake, since locking the phone
 * would drop the request. The time hint follows the clock, so it's right after the app returns.
 */
export default function ReadingPhoto({ photo, startedAt }: ReadingPhotoProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  useKeepAwake();
  const hintAt = startedAt + PHOTO_IMPORT_TIME_HINT_DELAY_MS;
  const showsHint = useTicker(hintAt) >= hintAt;
  useAnnouncement(showsHint ? COPY.timeHint : COPY.reading);

  return (
    <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
      <Image
        source={{ uri: photo.uri }}
        style={{ width: RECIPE_PHOTO_THUMBNAIL_SIZE, height: RECIPE_PHOTO_THUMBNAIL_SIZE, borderRadius: radius.md, opacity: 0.6 }}
      />
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={{ color: colors.foreground, fontSize: fontSize.md, textAlign: "center" }}>{COPY.reading}</Text>
      {showsHint ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, textAlign: "center" }}>{COPY.timeHint}</Text> : null}
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, textAlign: "center" }}>{MESSAGES.leavingCancels}</Text>
    </View>
  );
}
