import { router } from "expo-router";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import HomeCard from "../home/HomeCard";
import HomeLinkRow from "../home/HomeLinkRow";

export default function MoreWaysToLook() {
  return (
    <HomeCard title={MESSAGES.moreTools}>
      <HomeLinkRow label={MESSAGES.utilityCosts} onPress={() => router.navigate("/analytics")} />
      <HomeLinkRow label={MESSAGES.propertyPnl} onPress={() => router.navigate("/property-pnl")} />
    </HomeCard>
  );
}
