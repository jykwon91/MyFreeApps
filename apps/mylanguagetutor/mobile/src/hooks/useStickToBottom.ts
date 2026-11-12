import { useReduceMotion } from "@platform/mobile";
import { useCallback, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from "react-native";
import { STICK_TO_BOTTOM_DISTANCE } from "../constants/conversation";
import type { StickToBottom } from "../types/StickToBottom";
import { isNearBottom } from "../utils/isNearBottom";

/** Keeps the newest message in view, unless the reader has scrolled up to read an earlier one. */
export function useStickToBottom(): StickToBottom {
  const scroller = useRef<ScrollViewInstance>(null);
  const isFollowing = useRef(true);
  const reduceMotion = useReduceMotion();

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isFollowing.current = isNearBottom(event.nativeEvent, STICK_TO_BOTTOM_DISTANCE);
  }, []);

  // New content grows the list; the keyboard opening shrinks the view. Either can push the
  // newest message out of sight, so both follow it while the reader is at the end.
  const follow = useCallback(() => {
    if (isFollowing.current) scroller.current?.scrollToEnd({ animated: !reduceMotion });
  }, [reduceMotion]);

  const stick = useCallback(() => {
    isFollowing.current = true;
  }, []);

  return { scroller, onScroll, onContentSizeChange: follow, onLayout: follow, stick };
}
