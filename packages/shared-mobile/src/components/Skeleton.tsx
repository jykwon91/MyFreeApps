import { useEffect, useState } from "react";
import { Animated } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { SkeletonProps } from "../types/SkeletonProps";

const DEFAULT_HEIGHT = 16;
const MIN_OPACITY = 0.4;
const PULSE_MS = 800;

export default function Skeleton({
  width = "100%",
  height = DEFAULT_HEIGHT,
  borderRadius,
  style,
  testID,
}: SkeletonProps) {
  const { colors, radius } = useTheme();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: MIN_OPACITY, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

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
