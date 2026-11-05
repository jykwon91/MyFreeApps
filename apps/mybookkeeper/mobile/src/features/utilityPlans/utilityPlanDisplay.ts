import type { UtilityPlanDetail } from "@mybookkeeper/api-client/types/utility/utility-plan-detail";
import { UTILITY_PLAN_RATE_TYPE_LABELS } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-type";
import type { UtilityPlanRenewalStatus } from "@mybookkeeper/api-client/types/utility/utility-plan-renewal-status";
import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";
import { UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { formatMonths } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { formatCents, formatCentsPerKwh, formatRenewalCountdown } from "@mybookkeeper/api-client/utils/utilityPlanFormat";
import { EXPIRING_SOON_DAYS, UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import { daysBetween, fullDateLabel } from "../../lib/localDate";
import type { UtilityPlanFact } from "../../types/UtilityPlanFact";

const SORT_GROUP: Record<UtilityPlanRenewalStatus, number> = {
  expired: 0,
  expiring_soon: 1,
  active: 2,
  not_applicable: 3,
};
const PAST_PLAN_GROUP = 4;

export function planTitle(plan: Pick<UtilityPlanSummary, "property_name" | "service_type">): string {
  return `${plan.property_name ?? MESSAGES.unknownProperty} · ${UTILITY_SERVICE_TYPE_LABELS[plan.service_type]}`;
}

export function planProvider(plan: Pick<UtilityPlanSummary, "provider_name" | "plan_name">): string {
  return plan.plan_name ? `${plan.provider_name} · ${plan.plan_name}` : plan.provider_name;
}

export function planPriceLine(plan: Pick<UtilityPlanSummary, "rate_type" | "avg_price_cents_per_kwh_at_1000">): string {
  const rateType = UTILITY_PLAN_RATE_TYPE_LABELS[plan.rate_type];
  return plan.avg_price_cents_per_kwh_at_1000 ? `${rateType} · ${formatCentsPerKwh(plan.avg_price_cents_per_kwh_at_1000)} at 1,000 kWh` : rateType;
}

/**
 * The server's rule worked out from the phone's date. The server's own answer
 * uses its clock and ages while the app stays open, so it could disagree with
 * the countdown shown beside it.
 */
function renewalStatusOn(plan: Pick<UtilityPlanSummary, "rate_type" | "term_end_date">, todayIso: string): UtilityPlanRenewalStatus {
  if (plan.rate_type === "regulated" || !plan.term_end_date) return "not_applicable";
  const days = daysBetween(todayIso, plan.term_end_date);
  if (days < 0) return "expired";
  return days <= EXPIRING_SOON_DAYS ? "expiring_soon" : "active";
}

/** Null when there's nothing to look at, so a chip always means something. A past plan never reads as lapsed. */
export function planChip(plan: Pick<UtilityPlanSummary, "is_current" | "rate_type" | "term_end_date">, todayIso: string): string | null {
  if (!plan.is_current) return MESSAGES.pastPlan;
  const status = renewalStatusOn(plan, todayIso);
  if (!plan.term_end_date || (status !== "expired" && status !== "expiring_soon")) return null;
  return formatRenewalCountdown(daysBetween(todayIso, plan.term_end_date));
}

/** Regulated service really has no term; on any other plan a missing date only means nobody recorded it. */
export function planTermNote(plan: Pick<UtilityPlanSummary, "is_current" | "rate_type" | "term_end_date">): string | null {
  if (!plan.is_current || plan.term_end_date) return null;
  return plan.rate_type === "regulated" ? MESSAGES.noFixedTerm : formatRenewalCountdown(null);
}

function sortGroup(plan: Pick<UtilityPlanSummary, "is_current" | "rate_type" | "term_end_date">, todayIso: string): number {
  return plan.is_current ? SORT_GROUP[renewalStatusOn(plan, todayIso)] : PAST_PLAN_GROUP;
}

/** What needs attention first, soonest date first, past plans last. */
export function sortedPlans<Plan extends UtilityPlanSummary>(plans: readonly Plan[], todayIso: string): Plan[] {
  return [...plans].sort(
    (a, b) =>
      sortGroup(a, todayIso) - sortGroup(b, todayIso) ||
      (a.term_end_date ?? "").localeCompare(b.term_end_date ?? "") ||
      planTitle(a).localeCompare(planTitle(b)),
  );
}

export function planRowLabel(plan: UtilityPlanSummary, todayIso: string): string {
  return [planTitle(plan), planProvider(plan), planPriceLine(plan), planChip(plan, todayIso)].filter(Boolean).join(", ");
}

function monthly(cents: number): string {
  return `${formatCents(cents)}/mo`;
}

function billCredit(plan: UtilityPlanDetail): string | null {
  if (!plan.has_bill_credit || plan.bill_credit_amount_cents === null) return null;
  const amount = formatCents(plan.bill_credit_amount_cents);
  return plan.bill_credit_threshold_kwh === null ? amount : `${amount} at ${plan.bill_credit_threshold_kwh.toLocaleString("en-US")} kWh`;
}

function minimumUsageFee(plan: UtilityPlanDetail): string | null {
  if (plan.min_usage_fee_cents === null) return null;
  const amount = formatCents(plan.min_usage_fee_cents);
  return plan.min_usage_threshold_kwh === null ? amount : `${amount} under ${plan.min_usage_threshold_kwh.toLocaleString("en-US")} kWh`;
}

/** What the plan has recorded, in the order someone on a call with the provider would look for it. */
export function planFacts(plan: UtilityPlanDetail): UtilityPlanFact[] {
  const facts: { label: string; value: string | null }[] = [
    { label: MESSAGES.termEnds, value: plan.term_end_date && fullDateLabel(plan.term_end_date) },
    { label: MESSAGES.termLength, value: plan.term_months === null ? null : formatMonths(plan.term_months) },
    { label: MESSAGES.started, value: plan.service_start_date && fullDateLabel(plan.service_start_date) },
    { label: MESSAGES.earlyTerminationFee, value: plan.early_termination_fee_cents === null ? null : formatCents(plan.early_termination_fee_cents) },
    { label: MESSAGES.averageAt1000, value: plan.avg_price_cents_per_kwh_at_1000 && formatCentsPerKwh(plan.avg_price_cents_per_kwh_at_1000) },
    { label: MESSAGES.energyCharge, value: plan.energy_charge_cents_per_kwh && formatCentsPerKwh(plan.energy_charge_cents_per_kwh) },
    { label: MESSAGES.deliveryCharge, value: plan.tdu_charge_cents_per_kwh && formatCentsPerKwh(plan.tdu_charge_cents_per_kwh) },
    { label: MESSAGES.baseCharge, value: plan.monthly_base_charge_cents === null ? null : formatCents(plan.monthly_base_charge_cents) },
    { label: MESSAGES.billCredit, value: billCredit(plan) },
    { label: MESSAGES.minimumUsageFee, value: minimumUsageFee(plan) },
    { label: MESSAGES.afterPromo, value: plan.post_promo_monthly_cents === null ? null : monthly(plan.post_promo_monthly_cents) },
    { label: MESSAGES.equipmentFee, value: plan.equipment_fee_monthly_cents === null ? null : monthly(plan.equipment_fee_monthly_cents) },
    { label: MESSAGES.download, value: plan.download_mbps === null ? null : `${plan.download_mbps} Mbps` },
    { label: MESSAGES.upload, value: plan.upload_mbps === null ? null : `${plan.upload_mbps} Mbps` },
    { label: MESSAGES.dataCap, value: plan.data_cap_gb === null ? null : `${plan.data_cap_gb} GB` },
  ];
  return facts.filter((fact): fact is UtilityPlanFact => Boolean(fact.value));
}
