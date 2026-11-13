import { NO_RATE } from "../constants/rateDisplay";
import { formatRate } from "./formatRate";

/** A vendor's hourly rate, shortened to "/hr" to fit rows and cells. Cents only when there are some. */
export function formatHourlyRate(rate: string | null | undefined): string {
  const amount = formatRate(rate);
  return amount === NO_RATE ? amount : `${amount}/hr`;
}
