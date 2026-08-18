import type { OfferEnrollTone } from "@/shared/types/utility/offer-enroll-tone";

const TONE_CLASS: Record<OfferEnrollTone, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border border-border hover:bg-muted",
};

export interface OfferEnrollLinkProps {
  href: string;
  providerName: string;
  tone: OfferEnrollTone;
  testId: string;
}

/**
 * The link that acts on an offer — the thing the whole comparison exists for.
 *
 * The label carries the provider name so it still says what it does when read
 * on its own, and real names run long ("CHAMPION ENERGY SERVICES LLC"). It
 * therefore has to wrap: pinning it to one line pushed 13px of horizontal
 * scroll onto the whole page at 375px. Vertical padding rather than a fixed
 * height keeps the 44px touch target intact once it wraps to two lines.
 */
export default function OfferEnrollLink({
  href,
  providerName,
  tone,
  testId,
}: OfferEnrollLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center justify-center text-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium ${TONE_CLASS[tone]}`}
      data-testid={testId}
    >
      Sign up with {providerName}
    </a>
  );
}
