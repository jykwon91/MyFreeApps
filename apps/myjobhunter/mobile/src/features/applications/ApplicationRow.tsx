import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { APPLICATION_MESSAGES } from "../../constants/applications";
import type { ApplicationRowProps } from "../../types/ApplicationRowProps";
import { applicationDetails, applicationRowLabel, companyName, fitText, statusLabel, statusTone } from "./applicationDisplay";

export default function ApplicationRow({ application, onPress }: ApplicationRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const fit = fitText(application);
  const details = applicationDetails(application);
  const status = statusLabel(application);

  return (
    <Pressable
      accessibilityHint={APPLICATION_MESSAGES.opensApplication}
      accessibilityLabel={applicationRowLabel(application)}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {companyName(application)}
        </Text>
        {fit ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{fit}</Text> : null}
      </View>
      <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {application.role_title}
      </Text>
      {details ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {details}
        </Text>
      ) : null}
      {status ? <Chip label={status} tone={statusTone(application)} /> : null}
    </Pressable>
  );
}
