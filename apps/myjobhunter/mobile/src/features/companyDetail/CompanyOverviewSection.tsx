import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../constants/companyDetail";
import { companyOverviewFacts } from "../../lib/companyOverviewFacts";
import type { CompanyOverviewSectionProps } from "../../types/CompanyOverviewSectionProps";
import OverviewFact from "../applicationDetail/OverviewFact";
import SectionHeading from "../applicationDetail/SectionHeading";

/** The website's HQ, Created, Domain and Industry, then the company's description when it has one. */
export default function CompanyOverviewSection({ company }: CompanyOverviewSectionProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading title={MESSAGES.overview} />
      {companyOverviewFacts(company).map((fact) => (
        <OverviewFact key={fact.label} label={fact.label} value={fact.value} />
      ))}
      {company.description ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}>
          <Text
            accessibilityRole="header"
            style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, fontSize: fontSize.xs, color: colors.mutedForeground }}
          >
            {MESSAGES.description.toUpperCase()}
          </Text>
          <Text selectable style={{ padding: spacing.md, fontSize: fontSize.sm, color: colors.foreground }}>
            {company.description}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
