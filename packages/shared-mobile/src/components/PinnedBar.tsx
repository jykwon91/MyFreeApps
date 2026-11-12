import { useLayoutEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useKeyboardContext, useKeyboardHandler } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PinnedBarProps } from "../types/PinnedBarProps";

/**
 * A bar pinned below a scroll view inside HeaderKeyboardAvoidingView, such as a form's submit row. With the keyboard
 * closed it pads for the home indicator; with it open the keyboard covers that strip, so the padding shrinks as the
 * keyboard opens rather than floating the bar a strip above it.
 *
 * The provider's own progress value only moves frame by frame on Android (on iOS it jumps to where the keyboard is
 * headed), so this keeps its own, moved by the keyboard's every frame on both platforms the way the library's
 * KeyboardAvoidingView does, and starts from where the keyboard is when the bar mounts.
 */
export default function PinnedBar({ children, bottomSpacing, style }: PinnedBarProps) {
  const { bottom } = useSafeAreaInsets();
  const keyboardProgress = useKeyboardContext().reanimated.progress;
  const progress = useSharedValue(0);

  // Seeded once (both are shared values, which last the component's life), as the library's KeyboardAvoidingView
  // seeds its own; the keyboard handler moves it from then on.
  useLayoutEffect(() => {
    progress.set(keyboardProgress.get());
  }, [progress, keyboardProgress]);

  useKeyboardHandler(
    {
      onMove: (event) => {
        "worklet";
        progress.set(event.progress);
      },
      onInteractive: (event) => {
        "worklet";
        progress.set(event.progress);
      },
      onEnd: (event) => {
        "worklet";
        progress.set(event.progress);
      },
    },
    [],
  );

  const padding = useAnimatedStyle(() => ({ paddingBottom: bottomSpacing + bottom * (1 - progress.get()) }));
  return <Animated.View style={[style, padding]}>{children}</Animated.View>;
}
