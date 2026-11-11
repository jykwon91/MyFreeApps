import { companyFieldText } from "@myjobhunter/api-client/utils/companyFieldText";
import { LINK_MESSAGES, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import type { CompanyRowProps } from "../../types/CompanyRowProps";
import { companyDetails, companyRowLabel } from "./companyDisplay";

/** The website's Name, Domain, Industry and HQ columns as one row, leaving out what a company doesn't have. */
export default function CompanyRow({ company, onPress }: CompanyRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const domain = companyFieldText(company, "primary_domain");
  const details = companyDetails(company);

  return (
    <Pressable
      accessibilityHint={LINK_MESSAGES.opensBrowser}
      accessibilityLabel={companyRowLabel(company)}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={1} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {company.name}
      </Text>
      {domain ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {domain}
        </Text>
      ) : null}
      {details ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {details}
        </Text>
      ) : null}
    </Pressable>
  );
}
