import { companyFieldText } from "@myjobhunter/api-client/utils/companyFieldText";
import { companyDomainUrl } from "@myjobhunter/api-client/utils/companyDomainUrl";
import { Chip, MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../constants/companyDetail";
import type { CompanyHeaderProps } from "../../types/CompanyHeaderProps";

/** The company's name, its website, and chips for its industry and size, as the website's header shows them. */
export default function CompanyHeader({ company }: CompanyHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const domain = companyFieldText(company, "primary_domain");
  const industry = companyFieldText(company, "industry");
  const size = companyFieldText(company, "size_range");
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
        {company.name}
      </Text>
      {domain ? (
        <Pressable
          accessibilityHint={MESSAGES.opensWebsite}
          accessibilityRole="link"
          onPress={() => void openLink(companyDomainUrl(domain))}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text style={{ fontSize: fontSize.md, color: colors.primary, textDecorationLine: "underline" }}>{domain}</Text>
        </Pressable>
      ) : null}
      {industry || size ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.xs }}>
          {industry ? <Chip label={industry} tone="info" /> : null}
          {size ? <Chip label={size} /> : null}
        </View>
      ) : null}
    </View>
  );
}
