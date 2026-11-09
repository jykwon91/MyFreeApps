import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import { useTheme } from "@platform/mobile";
import type { ReactElement } from "react";
import { FlatList, useWindowDimensions } from "react-native";
import { LISTING_PHOTO_GRID_COLUMNS } from "../../constants/listingPhotos";
import ListingPhotoTile from "./ListingPhotoTile";

const INITIAL_ROWS = 4;
const WINDOW_SIZE = 5;

interface ListingPhotoGridProps {
  photos: readonly ListingPhoto[];
  isSelecting: boolean;
  selected: ReadonlySet<string>;
  onPress: (photo: ListingPhoto, index: number) => void;
  /** Everything above the photos: it scrolls with them. */
  header: ReactElement;
}

/** Only the rows near the screen are drawn, so a listing with many photos doesn't hold them all in memory. */
export default function ListingPhotoGrid({ photos, isSelecting, selected, onPress, header }: ListingPhotoGridProps) {
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - spacing.lg * 2 - spacing.sm * (LISTING_PHOTO_GRID_COLUMNS - 1)) / LISTING_PHOTO_GRID_COLUMNS);
  return (
    <FlatList
      columnWrapperStyle={{ gap: spacing.sm }}
      contentContainerStyle={{ gap: spacing.sm, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      data={photos}
      extraData={[selected, isSelecting]}
      initialNumToRender={INITIAL_ROWS * LISTING_PHOTO_GRID_COLUMNS}
      keyExtractor={(photo) => photo.id}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ gap: spacing.lg, marginBottom: spacing.sm }}
      numColumns={LISTING_PHOTO_GRID_COLUMNS}
      removeClippedSubviews
      renderItem={({ item, index }) => (
        <ListingPhotoTile index={index} isSelected={selected.has(item.id)} isSelecting={isSelecting} onPress={() => onPress(item, index)} photo={item} size={size} total={photos.length} />
      )}
      windowSize={WINDOW_SIZE}
    />
  );
}
