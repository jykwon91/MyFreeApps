import { Text, View } from "react-native";
import { SECURITY_MESSAGES as MESSAGES } from "../constants/security";
import { useTheme } from "../theme/useTheme";
import type { DataPrivacySectionProps } from "../types/DataPrivacySectionProps";
import LoadingButton from "./LoadingButton";
import SettingsCard from "./SettingsCard";

/** Taking a copy of everything, or deleting everything. */
export default function DataPrivacySection({ exportDescription, onExport, onDeleteAccount }: DataPrivacySectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <SettingsCard>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {MESSAGES.dataHeading}
      </Text>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "500" }}>{MESSAGES.exportHeading}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{exportDescription}</Text>
        <LoadingButton loadingText={MESSAGES.exporting} onPress={onExport} variant="secondary">
          {MESSAGES.exportButton}
        </LoadingButton>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.destructiveText, fontSize: fontSize.md, fontWeight: "500" }}>{MESSAGES.deleteHeading}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.deleteBody}</Text>
        <LoadingButton onPress={onDeleteAccount} variant="destructive">
          {MESSAGES.deleteButton}
        </LoadingButton>
      </View>
    </SettingsCard>
  );
}
