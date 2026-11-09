import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import { useTheme } from "@platform/mobile";
import { useWindowDimensions, View } from "react-native";
import ListingPhotoTile from "./ListingPhotoTile";

const COLUMNS = 3;

interface ListingPhotoGridProps {
  photos: readonly ListingPhoto[];
  isSelecting: boolean;
  selected: ReadonlySet<string>;
  onPress: (photo: ListingPhoto, index: number) => void;
}

export default function ListingPhotoGrid({ photos, isSelecting, selected, onPress }: ListingPhotoGridProps) {
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - spacing.lg * 2 - spacing.sm * (COLUMNS - 1)) / COLUMNS);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {photos.map((photo, index) => (
        <ListingPhotoTile index={index} isSelected={selected.has(photo.id)} isSelecting={isSelecting} key={photo.id} onPress={() => onPress(photo, index)} photo={photo} size={size} total={photos.length} />
      ))}
    </View>
  );
}
