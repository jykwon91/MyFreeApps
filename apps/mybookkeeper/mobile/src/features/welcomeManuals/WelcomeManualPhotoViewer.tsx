import { useRef, useState } from "react";
import { FlatList, Modal, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  pageAtOffset,
  photoViewerEditLabel,
  photoViewerCounter,
  WELCOME_MANUAL_PHOTO_VIEWER_GLYPHS as GLYPHS,
  WELCOME_MANUAL_PHOTO_VIEWER_MESSAGES as MESSAGES,
  WELCOME_MANUAL_PHOTO_VIEWER_STYLE as STYLE,
} from "../../constants/welcomeManualPhotoViewer";
import type { WelcomeManualPhotoViewerProps } from "../../types/WelcomeManualPhotoViewerProps";
import WelcomeManualPhotoViewerPage from "./WelcomeManualPhotoViewerPage";
import WelcomeManualViewerButton from "./WelcomeManualViewerButton";

/** Every photo of a section, full screen: swipe or use the buttons to page, with a count and each caption. */
export default function WelcomeManualPhotoViewer({ images, startIndex, onClose, onEdit }: WelcomeManualPhotoViewerProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList>(null);
  const [index, setIndex] = useState(startIndex);
  const total = images.length;

  function goTo(next: number): void {
    if (next < 0 || next >= total) return;
    setIndex(next);
    list.current?.scrollToIndex({ index: next, animated: true });
  }

  function onSettled(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    setIndex(pageAtOffset(event.nativeEvent.contentOffset.x, width, total));
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent testID="welcome-manual-photo-viewer" visible>
      <View style={{ flex: 1, backgroundColor: STYLE.backdrop }}>
        <FlatList
          ref={list}
          data={images}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          horizontal
          initialScrollIndex={startIndex}
          keyExtractor={(image) => image.id}
          onMomentumScrollEnd={onSettled}
          pagingEnabled
          renderItem={({ item, index: i }) => <WelcomeManualPhotoViewerPage image={item} index={i} total={total} width={width} />}
          showsHorizontalScrollIndicator={false}
          testID="welcome-manual-photo-pager"
        />
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" }}>
          {onEdit ? <WelcomeManualViewerButton glyph={GLYPHS.edit} label={photoViewerEditLabel(index, total)} onPress={() => onEdit(images[index])} /> : <View />}
          <WelcomeManualViewerButton glyph={GLYPHS.close} label={MESSAGES.close} onPress={onClose} />
        </View>
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, bottom: 0, left: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {index > 0 ? <WelcomeManualViewerButton glyph={GLYPHS.previous} label={MESSAGES.previous} onPress={() => goTo(index - 1)} /> : <View />}
          {index < total - 1 ? <WelcomeManualViewerButton glyph={GLYPHS.next} label={MESSAGES.next} onPress={() => goTo(index + 1)} /> : <View />}
        </View>
        <View pointerEvents="none" style={{ position: "absolute", bottom: insets.bottom + 12, left: 0, right: 0, alignItems: "center" }}>
          <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, overflow: "hidden", backgroundColor: STYLE.overlay, color: STYLE.onBackdrop }}>
            {photoViewerCounter(index, total)}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
