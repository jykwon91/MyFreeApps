import { APPLICATION_ARCHIVED_LABEL } from "@myjobhunter/api-client/constants/applicationArchivedLabel";
import { Chip, ClampedText, ListRowTitle, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { APPLICATION_MESSAGES } from "../../constants/applications";
import type { ApplicationRowProps } from "../../types/ApplicationRowProps";
import { applicationDetails, applicationRowLabel, companyName, fitText, statusLabel, statusTone } from "./applicationDisplay";

function ApplicationRow({ application, onPress }: ApplicationRowProps) {
  const { colors, spacing, fontSize } = useTheme();
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
      <ClampedText numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {application.role_title}
      </ClampedText>
      {details ? (
        <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {details}
        </ClampedText>
      ) : null}
      {status || application.archived ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {status ? <Chip label={status} tone={statusTone(application)} /> : null}
          {application.archived ? <Chip label={APPLICATION_ARCHIVED_LABEL} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export default memo(ApplicationRow);
