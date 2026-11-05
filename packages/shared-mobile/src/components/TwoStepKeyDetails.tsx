import { usePreventScreenCapture } from "expo-screen-capture";
import { Text, View } from "react-native";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../theme/useTheme";
import type { TwoStepKeyDetailsProps } from "../types/TwoStepKeyDetailsProps";
import { copySecret } from "../utils/copySecret";
import { algorithmName, keyForScreenReader, keyInFours } from "../utils/twoStepDisplay";
import LoadingButton from "./LoadingButton";

/** Its own component so screenshots are only off while the key is on screen. */
export default function TwoStepKeyDetails({ setup }: TwoStepKeyDetailsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  usePreventScreenCapture();

  async function copyKey(): Promise<void> {
    try {
      await copySecret(setup.secret);
      showToast(MESSAGES.keyCopied, "success");
    } catch {
      showToast(MESSAGES.copyFailed, "error");
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        accessibilityLabel={keyForScreenReader(setup.secret)}
        style={{ color: colors.foreground, fontSize: fontSize.md, fontVariant: ["tabular-nums"] }}
      >
        {keyInFours(setup.secret)}
      </Text>
      <LoadingButton onPress={copyKey} variant="secondary">
        {MESSAGES.copyKey}
      </LoadingButton>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        {MESSAGES.settings(algorithmName(setup.algorithm), setup.digits, setup.period)}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.keyScreenshotsOff}</Text>
    </View>
  );
}
