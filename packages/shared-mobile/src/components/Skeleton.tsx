import { useEffect, useState } from "react";
import { Animated } from "react-native";
import {
  SKELETON_DEFAULT_HEIGHT,
  SKELETON_MIN_OPACITY,
  SKELETON_PULSE_MS,
} from "../constants/skeleton";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { useTheme } from "../theme/useTheme";
import type { SkeletonProps } from "../types/SkeletonProps";

export default function Skeleton({
  width = "100%",
  height = SKELETON_DEFAULT_HEIGHT,
  borderRadius,
  style,
  testID,
}: SkeletonProps) {
  const { colors, radius } = useTheme();
  const [opacity] = useState(() => new Animated.Value(1));

  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion !== false) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: SKELETON_MIN_OPACITY,
          duration: SKELETON_PULSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: SKELETON_PULSE_MS, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => {
      pulse.stop();
      opacity.setValue(1);
    };
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID={testID}
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? radius.sm,
          backgroundColor: colors.muted,
          opacity,
        },
        style,
      ]}
    />
  );
}
