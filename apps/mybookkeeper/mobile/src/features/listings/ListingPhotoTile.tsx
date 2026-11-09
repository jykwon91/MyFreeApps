import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import { useTheme } from "@platform/mobile";
import { Image, Pressable, Text, View } from "react-native";
import { LISTING_PHOTO_CAPTION_LINES, LISTING_PHOTO_MESSAGES as MESSAGES, photoLabel } from "../../constants/listingPhotos";
import { photoUrl } from "./listingPhotoDisplay";

interface ListingPhotoTileProps {
  photo: ListingPhoto;
  index: number;
  total: number;
  size: number;
  isSelecting: boolean;
  isSelected: boolean;
  onPress: () => void;
}

export default function ListingPhotoTile({ photo, index, total, size, isSelecting, isSelected, onPress }: ListingPhotoTileProps) {
  const { colors, radius, fontSize, spacing } = useTheme();
  const url = photoUrl(photo);
  const label = photoLabel(index, total, photo.caption, [index === 0 ? MESSAGES.cover : null, url ? null : MESSAGES.unavailable]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={isSelecting ? { selected: isSelected } : undefined}
      onPress={onPress}
      style={{ width: size, height: size, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.muted, borderWidth: isSelected ? 3 : 0, borderColor: colors.foreground }}
    >
      {url ? (
        <Image accessibilityIgnoresInvertColors resizeMethod="resize" resizeMode="cover" source={{ uri: url }} style={{ width: "100%", height: "100%" }} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xs }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground, textAlign: "center" }}>{MESSAGES.unavailable}</Text>
        </View>
      )}
      {index === 0 ? (
        <View style={{ position: "absolute", left: spacing.xs, top: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.background }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.foreground }}>{MESSAGES.cover}</Text>
        </View>
      ) : null}
      {photo.caption ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xs, backgroundColor: colors.background }}>
          <Text numberOfLines={LISTING_PHOTO_CAPTION_LINES} style={{ fontSize: fontSize.xs, color: colors.foreground }}>{photo.caption}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
