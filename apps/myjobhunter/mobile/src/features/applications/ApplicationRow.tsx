import { Chip, ListRowTitle, MIN_TOUCH_TARGET, useLargeText, useTheme } from "@platform/mobile";
import { memo } from "react";
import { Pressable, Text } from "react-native";
import { APPLICATION_MESSAGES } from "../../constants/applications";
import type { ApplicationRowProps } from "../../types/ApplicationRowProps";
import { applicationDetails, applicationRowLabel, companyName, fitText, statusLabel, statusTone } from "./applicationDisplay";

function ApplicationRow({ application, onPress }: ApplicationRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const isLargeText = useLargeText();
  const fit = fitText(application);
  const details = applicationDetails(application);
  const status = statusLabel(application);

  return (
    <Pressable
      accessibilityHint={APPLICATION_MESSAGES.opensApplication}
      accessibilityLabel={applicationRowLabel(application)}
      accessibilityRole="link"
      onPress={() => onPress(application)}
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
      <ListRowTitle aside={fit ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{fit}</Text> : null} title={companyName(application)} />
      <Text numberOfLines={isLargeText ? undefined : 2} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {application.role_title}
      </Text>
      {details ? (
        <Text numberOfLines={isLargeText ? undefined : 1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {details}
        </Text>
      ) : null}
      {status ? <Chip label={status} tone={statusTone(application)} /> : null}
    </Pressable>
  );
}

export default memo(ApplicationRow);
