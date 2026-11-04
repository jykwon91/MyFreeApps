import type { PropertySummary } from "@mybookkeeper/api-client/types/summary/PropertySummary";
import { LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { PROPERTIES_SHOWN_AT_FIRST, type HomePeriod } from "../../constants/home";
import { NO_FILTERS } from "../../constants/transactionFilters";
import { moneySign, signedMoney, spokenSignedMoney } from "../transactions/transactionDisplay";
import { transactionsLink } from "../transactions/transactionFilters";
import HomeCard from "./HomeCard";
import HomeLinkRow from "./HomeLinkRow";

export default function PropertyTotals({ properties, period }: { properties: readonly PropertySummary[]; period: HomePeriod }) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  // One property's totals are the numbers already on the screen.
  if (properties.length < 2) return null;
  const shown = showAll ? properties : properties.slice(0, PROPERTIES_SHOWN_AT_FIRST);

  return (
    <HomeCard title="By property">
      <View>
        {shown.map((property) => (
          <HomeLinkRow
            accessibilityLabel={`${property.name}, net ${spokenSignedMoney(property.profit)}`}
            detail={signedMoney(property.profit)}
            detailColor={moneySign(property.profit) > 0 ? colors.positiveText : undefined}
            key={property.property_id}
            label={property.name}
            onPress={() => router.navigate(transactionsLink({ ...NO_FILTERS, period, propertyId: property.property_id, approvedOnly: true }))}
          />
        ))}
      </View>
      {!showAll && properties.length > PROPERTIES_SHOWN_AT_FIRST ? (
        <LoadingButton onPress={() => setShowAll(true)} variant="ghost">
          {`Show all ${properties.length}`}
        </LoadingButton>
      ) : null}
    </HomeCard>
  );
}
