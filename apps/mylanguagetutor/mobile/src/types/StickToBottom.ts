import type { RefObject } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from "react-native";

/** Wiring for a ScrollView that follows new content while the reader is at the end of it. */
export interface StickToBottom {
  scroller: RefObject<ScrollViewInstance | null>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: () => void;
  /** The view itself changed size, as when the keyboard opens. */
  onLayout: () => void;
  /** Follows new content again, as after the reader sends something. */
  stick: () => void;
}
