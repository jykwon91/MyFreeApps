import { NO_RATE } from "@mybookkeeper/api-client/constants/rateDisplay";
import { formatRate } from "@mybookkeeper/api-client/utils/formatRate";

/** A vendor's hourly rate, shortened to "/hr" to fit table cells. Cents only when there are some, as on the phone. */
export function formatHourlyRate(rate: string | null | undefined): string {
  const amount = formatRate(rate);
  return amount === NO_RATE ? amount : `${amount}/hr`;
}
