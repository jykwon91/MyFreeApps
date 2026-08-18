import OfferDisclosure from "@/app/features/utility/OfferDisclosure";
import OfferEnrollLink from "@/app/features/utility/OfferEnrollLink";
import OfferStatGrid from "@/app/features/utility/OfferStatGrid";
import OfferVerdictBadge from "@/app/features/utility/OfferVerdictBadge";
import SavingHeadline from "@/app/features/utility/SavingHeadline";
import TierProviderPicker from "@/app/features/utility/TierProviderPicker";
import { buildOfferStats, offerVerdict } from "@/shared/lib/offer-stats";
import type { OfferTier } from "@/shared/types/utility/offer-tier";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

export interface OfferTierCardProps {
  tier: OfferTier;
  group: UtilityOfferGroup;
  referenceAnnualKwh: number;
  maxSavingCents: number;
  isBest: boolean;
}

/**
 * One candidate plan, stated as what changes if the property switches to it.
 *
 * A tier rather than an offer: several retailers routinely list the identical
 * rate, term and rating, and showing them as separate candidates implies five
 * decisions where there is one. The tier leads with the cheapest to leave and
 * folds the rest into a picker.
 */
export default function OfferTierCard({
  tier,
  group,
  referenceAnnualKwh,
  maxSavingCents,
  isBest,
}: OfferTierCardProps) {
  const offer = tier.lead;
  const stats = buildOfferStats(offer, group, referenceAnnualKwh);
  const verdict = offerVerdict(offer);

  return (
    <li
      className={`rounded-lg border p-4 ${
        isBest ? "border-green-600/60 dark:border-green-400/50 bg-green-50/40 dark:bg-green-900/10" : "border-border"
      }`}
      data-testid={`better-plan-${offer.external_plan_id}`}
    >
      {isBest ? (
        <p className="text-[11px] uppercase tracking-wide font-semibold text-green-700 dark:text-green-300">
          Best value
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium min-w-0 truncate">
          {offer.provider_name}
          <span className="text-muted-foreground font-normal">
            {" · "}
            {offer.plan_name}
          </span>
        </p>
        <OfferVerdictBadge verdict={verdict} />
      </div>

      <SavingHeadline
        savingCents={offer.annual_saving_cents}
        maxSavingCents={maxSavingCents}
        isConditional={verdict === "conditional"}
      />

      <OfferStatGrid stats={stats} />

      {offer.is_teaser_priced ? (
        <p
          className="text-xs mt-3 text-amber-700 dark:text-amber-300"
          data-testid={`better-plan-teaser-${offer.external_plan_id}`}
        >
          The low rate here only holds near 1,000 kWh — a bill credit props it
          up, and usage either side of that band costs more.
        </p>
      ) : null}

      {offer.enroll_url ? (
        <p className="mt-3">
          {/* One solid button per property. A column of identical primary
              buttons is a column of equally-weighted choices, which is the
              opposite of a ranking. */}
          <OfferEnrollLink
            href={offer.enroll_url}
            providerName={offer.provider_name}
            tone={isBest ? "primary" : "secondary"}
            testId={`better-plan-enroll-${offer.external_plan_id}`}
          />
        </p>
      ) : null}

      <OfferDisclosure offer={offer} />
      <TierProviderPicker alternates={tier.alternates} />
    </li>
  );
}
