import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { DISABLED_OPACITY } from "../../constants/conversation";
import { MIC_BUTTON_SIZE, MIC_PRESSED_OPACITY } from "../../constants/voice";
import type { MicButtonProps } from "../../types/MicButtonProps";
import MicGlyph from "./MicGlyph";

/**
 * The one big control of the practice screen, as on the website: tap to speak, tap again when done.
 * Tapping while the tutor is speaking interrupts it (barge-in). Disabled, never hidden, while a turn is
 * in flight, so the layout doesn't jump. Its name is the phase's label; the label under it is for
 * sighted learners only, so a screen reader doesn't read it twice.
 */
export default function MicButton({ phase, disabled, onStart, onStop }: MicButtonProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const listening = phase === "listening";
  const label = VOICE_COPY.micLabels[phase];
  const foreground = listening ? colors.destructiveForeground : colors.primaryForeground;
  return (
    <View style={{ alignItems: "center", gap: spacing.sm }}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: listening }}
        disabled={disabled}
        onPress={listening ? onStop : onStart}
        style={({ pressed }) => ({
          width: MIC_BUTTON_SIZE,
          height: MIC_BUTTON_SIZE,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius.full,
          backgroundColor: listening ? colors.destructive : colors.primary,
          opacity: disabled ? DISABLED_OPACITY : pressed ? MIC_PRESSED_OPACITY : 1,
        })}
        testID="mic-button"
      >
        <MicGlyph color={foreground} listening={listening} />
      </Pressable>
      <Text importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
        {label}
      </Text>
    </View>
  );
}
