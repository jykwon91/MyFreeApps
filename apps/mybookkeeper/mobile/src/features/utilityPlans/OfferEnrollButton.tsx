import { LoadingButton } from "@platform/mobile";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import { useOpenLink } from "../inquiries/useOpenLink";

interface OfferEnrollButtonProps {
  url: string;
  providerName: string;
  isPrimary: boolean;
}

/** Opens the provider's sign-up page. One solid button per property; the rest stay quiet so they don't read as equal picks. */
export default function OfferEnrollButton({ url, providerName, isPrimary }: OfferEnrollButtonProps) {
  const openLink = useOpenLink();
  return (
    <LoadingButton onPress={() => void openLink(url)} variant={isPrimary ? "primary" : "secondary"}>
      {MESSAGES.signUp(providerName)}
    </LoadingButton>
  );
}
