import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { APPLICATION_MESSAGES } from "../../constants/applications";
import { companyApplicationRowLabel } from "../../lib/companyApplicationRowLabel";
import type { CompanyApplicationRowProps } from "../../types/CompanyApplicationRowProps";
import { applicationDetails } from "../applications/applicationDisplay";

/** The website's Role, Location, Remote and Applied columns as one row, leaving out what an application doesn't say. */
export default function CompanyApplicationRow({ application, onPress }: CompanyApplicationRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const details = applicationDetails(application);
  return (
    <Pressable
      accessibilityHint={APPLICATION_MESSAGES.opensApplication}
      accessibilityLabel={companyApplicationRowLabel(application)}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        gap: spacing.xs,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.muted : colors.card,
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {application.role_title}
      </Text>
      {details ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {details}
        </Text>
      ) : null}
    </Pressable>
  );
}
