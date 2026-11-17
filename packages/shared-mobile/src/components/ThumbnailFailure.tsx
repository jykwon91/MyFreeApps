import { Pressable, StyleSheet, Text, View, type StyleProp, type ImageStyle } from "react-native";
import { THUMBNAIL_MIN_TOUCH_TARGET, THUMBNAIL_RETRY_HINT } from "../constants/thumbnail";
import { useTheme } from "../theme/useTheme";

interface ThumbnailFailureProps {
  message: string;
  style: StyleProp<ImageStyle>;
  testID?: string;
  onRetry?: () => void;
  retryLabel?: string;
  colors?: { text: string; background: string };
  hideText: boolean;
}

/** What a photo that couldn't load turns into: a tile in the photo's own box that says so, and offers a retry. */
export default function ThumbnailFailure({ message, style, testID, onRetry, retryLabel, colors: override, hideText }: ThumbnailFailureProps) {
  const { colors, fontSize, spacing } = useTheme();
  const { resizeMode: _resizeMode, tintColor: _tintColor, overlayColor: _overlayColor, ...boxStyle } = StyleSheet.flatten(style) ?? {};
  const color = override?.text ?? colors.mutedForeground;
  const box = [boxStyle, { alignItems: "center", justifyContent: "center", backgroundColor: override?.background ?? colors.muted, padding: spacing.xs }] as const;
  const text = { fontSize: fontSize.xs, color, textAlign: "center" } as const;

  if (!onRetry) {
    return (
      <View accessibilityLabel={message} accessible style={box} testID={testID}>
        {hideText ? null : <Text style={text}>{message}</Text>}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={THUMBNAIL_RETRY_HINT}
      accessibilityLabel={retryLabel ?? message}
      accessibilityRole="button"
      onPress={onRetry}
      style={[...box, { minHeight: THUMBNAIL_MIN_TOUCH_TARGET, minWidth: THUMBNAIL_MIN_TOUCH_TARGET }]}
      testID={testID}
    >
      {hideText ? null : <Text style={text}>{message}</Text>}
      {hideText ? null : <Text style={[text, { textDecorationLine: "underline" }]}>{THUMBNAIL_RETRY_HINT}</Text>}
    </Pressable>
  );
}
