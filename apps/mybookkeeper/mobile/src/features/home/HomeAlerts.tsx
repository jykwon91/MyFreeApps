import { useGetInsurancePremiumComparisonQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { useGetUtilityPlanRateComparisonQuery, useGetUtilityPlanRenewalAlertsQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { MIN_TOUCH_TARGET, Skeleton } from "@platform/mobile";
import { router } from "expo-router";
import { INSURANCE_LINK, UTILITY_RATE_CHECK_LINK, UTILITY_RENEWALS_LINK } from "../../constants/home";
import HomeCard from "./HomeCard";
import { alertsFailedMessage, insurancePremiumsAlertLabel, renewalAlertLabel, utilityRatesAlertLabel } from "./homeDisplay";
import HomeLinkRow from "./HomeLinkRow";
import HomeSectionError from "./HomeSectionError";

/**
 * The website's renewal, rate check and premium check cards, as one row each.
 * A row shows only when something costs money; with nothing to act on the
 * section isn't there at all, since all-clear is the usual answer.
 */
export default function HomeAlerts() {
  const renewals = useGetUtilityPlanRenewalAlertsQuery();
  const utilityRates = useGetUtilityPlanRateComparisonQuery();
  const insurancePremiums = useGetInsurancePremiumComparisonQuery();

  if (renewals.isLoading && utilityRates.isLoading && insurancePremiums.isLoading) {
    return (
      <HomeCard testID="home-alerts-skeleton">
        <Skeleton height={MIN_TOUCH_TARGET} width="80%" />
      </HomeCard>
    );
  }

  const renewalCount = renewals.data?.total_needing_attention ?? 0;
  const utilityRateCount = utilityRates.data?.total_above_market ?? 0;
  const premiumCount = insurancePremiums.data?.total_above_market ?? 0;
  // Data kept from before a failed refetch still shows, under Home's offline banner.
  const failedMessage = alertsFailedMessage({
    renewals: renewals.isError && !renewals.data,
    utilityRates: utilityRates.isError && !utilityRates.data,
    insurancePremiums: insurancePremiums.isError && !insurancePremiums.data,
  });
  if (renewalCount === 0 && utilityRateCount === 0 && premiumCount === 0 && !failedMessage) return null;

  async function retry(): Promise<void> {
    await Promise.all([renewals.refetch(), utilityRates.refetch(), insurancePremiums.refetch()]);
  }

  return (
    <HomeCard testID="home-alerts">
      {renewals.data && renewalCount > 0 ? (
        <HomeLinkRow label={renewalAlertLabel(renewals.data)} onPress={() => router.navigate(UTILITY_RENEWALS_LINK)} />
      ) : null}
      {utilityRateCount > 0 ? <HomeLinkRow label={utilityRatesAlertLabel(utilityRateCount)} onPress={() => router.navigate(UTILITY_RATE_CHECK_LINK)} /> : null}
      {premiumCount > 0 ? <HomeLinkRow label={insurancePremiumsAlertLabel(premiumCount)} onPress={() => router.navigate(INSURANCE_LINK)} /> : null}
      {failedMessage ? <HomeSectionError message={failedMessage} onRetry={retry} /> : null}
    </HomeCard>
  );
}
