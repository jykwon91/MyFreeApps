import { usePreventScreenCapture } from "expo-screen-capture";
import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { CHECKBOX_OFF_GLYPH, CHECKBOX_ON_GLYPH, RECOVERY_CODE_SHARE_SEPARATOR, TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useToast } from "../hooks/useToast";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { TwoStepRecoveryCodesProps } from "../types/TwoStepRecoveryCodesProps";
import { copySecret } from "../utils/copySecret";
import LoadingButton from "./LoadingButton";

export default function TwoStepRecoveryCodes({ codes, onDone }: TwoStepRecoveryCodesProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [isSaved, setIsSaved] = useState(false);
  usePreventScreenCapture();

  const allCodes = codes.join(RECOVERY_CODE_SHARE_SEPARATOR);

  async function copyAll(): Promise<void> {
    try {
      await copySecret(allCodes);
      showToast(MESSAGES.codesCopied, "success");
    } catch {
      showToast(MESSAGES.copyFailed, "error");
    }
  }

  async function share(): Promise<void> {
    try {
      await Share.share({ message: allCodes });
    } catch {
      showToast(MESSAGES.shareFailed, "error");
    }
  }

  return (
    <>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {MESSAGES.codesHeading}
      </Text>
      <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{MESSAGES.codesBody}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm }}>
        {codes.map((code) => (
          <Text
            key={code}
            style={{ color: colors.foreground, fontSize: fontSize.md, fontVariant: ["tabular-nums"], width: "50%" }}
          >
            {code}
          </Text>
        ))}
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.screenshotsOff}</Text>
      <LoadingButton onPress={share} variant="secondary">
        {MESSAGES.share}
      </LoadingButton>
      <LoadingButton onPress={copyAll} variant="secondary">
        {MESSAGES.copyAll}
      </LoadingButton>
      <Pressable
        accessibilityLabel={MESSAGES.saved}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSaved }}
        onPress={() => setIsSaved((saved) => !saved)}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: MIN_TOUCH_TARGET }}
      >
        <Text style={{ color: colors.primary, fontSize: fontSize.lg }}>{isSaved ? CHECKBOX_ON_GLYPH : CHECKBOX_OFF_GLYPH}</Text>
        <Text style={{ color: colors.foreground, flexShrink: 1, fontSize: fontSize.sm }}>{MESSAGES.saved}</Text>
      </Pressable>
      <LoadingButton disabled={!isSaved} onPress={onDone}>
        {MESSAGES.done}
      </LoadingButton>
    </>
  );
}
