import { MARKET_RATE_MESSAGES as MESSAGES } from "../../constants/marketRates";
import RequireWrite from "../workspace/RequireWrite";
import MarketRateFormLoader from "./MarketRateFormLoader";
import UtilityPlanDetailSkeleton from "./UtilityPlanDetailSkeleton";

/** The form for one service. A viewer is told they can't, and the rates aren't fetched for them. */
export default function MarketRateFormScreen({ serviceType }: { serviceType: string }) {
  return (
    <RequireWrite body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} loading={<UtilityPlanDetailSkeleton />}>
      <MarketRateFormLoader serviceType={serviceType} />
    </RequireWrite>
  );
}
