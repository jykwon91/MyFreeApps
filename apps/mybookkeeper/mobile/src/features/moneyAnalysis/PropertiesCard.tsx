import type { PropertyMonthlySummary } from "@mybookkeeper/api-client/types/summary/PropertyMonthlySummary";
import type { PropertySummary } from "@mybookkeeper/api-client/types/summary/PropertySummary";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisScope } from "../../types/AnalysisScope";
import HomeCard from "../home/HomeCard";
import PropertyRow from "./PropertyRow";

interface PropertiesCardProps {
  properties: readonly PropertySummary[];
  previous: readonly PropertySummary[] | null;
  monthly: readonly PropertyMonthlySummary[];
  againstLabel: string;
  scope: AnalysisScope;
}

/** Each property's profit, set against the earlier stretch when comparing. One property's totals are the numbers already above. */
export default function PropertiesCard({ properties, previous, monthly, againstLabel, scope }: PropertiesCardProps) {
  if (properties.length < 2) return null;
  return (
    <HomeCard title={MESSAGES.byProperty}>
      {properties.map((property) => (
        <PropertyRow
          againstLabel={againstLabel}
          isComparing={previous !== null}
          key={property.property_id}
          monthly={monthly.find((row) => row.property_id === property.property_id)}
          previous={previous?.find((row) => row.property_id === property.property_id) ?? null}
          property={property}
          scope={scope}
        />
      ))}
    </HomeCard>
  );
}
