import { useListClassificationRulesQuery } from "@mybookkeeper/api-client/store/classificationRulesApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { EmptyState, useRefresh } from "@platform/mobile";
import { useMemo } from "react";
import { VENDOR_RULE_MESSAGES } from "../../constants/vendorRules";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useIsAdmin } from "../workspace/useIsAdmin";
import VendorRuleDetailBody from "./VendorRuleDetailBody";
import VendorRuleDetailSkeleton from "./VendorRuleDetailSkeleton";

/** The server has no single-rule read, so the rule comes from the same list the previous screen shows. */
export default function VendorRuleDetailScreen({ id }: { id: string }) {
  const canDelete = useIsAdmin();
  const { currentData: rules, error, isFetching, refetch } = useListClassificationRulesQuery();
  const { data: loadedProperties, isLoading: propertiesLoading, isError: propertiesFailed, refetch: refetchProperties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { isLeaving, leave } = useLeaveWhenSaved("/vendor-rules");
  const propertyNames = useMemo(() => new Map((loadedProperties ?? []).map((property) => [property.id, property.name])), [loadedProperties]);
  const propertyState = propertiesFailed && !loadedProperties ? "failed" : propertiesLoading ? "pending" : "ready";
  const rule = rules?.find((candidate) => candidate.id === id);

  if (isLeaving || (!rules && (isFetching || !error))) return <VendorRuleDetailSkeleton />;
  if (!rules) {
    return (
      <EmptyState
        action={{ label: VENDOR_RULE_MESSAGES.tryAgain, onPress: refresh }}
        body={VENDOR_RULE_MESSAGES.tryAgainOffer}
        heading={VENDOR_RULE_MESSAGES.couldntLoadOne}
      />
    );
  }
  if (!rule) {
    return (
      <EmptyState
        action={{ label: VENDOR_RULE_MESSAGES.back, onPress: leave }}
        body={VENDOR_RULE_MESSAGES.maybeDeleted}
        heading={VENDOR_RULE_MESSAGES.cantFind}
      />
    );
  }
  return (
    <VendorRuleDetailBody
      canDelete={canDelete}
      hasStaleData={Boolean(error)}
      onDeleted={leave}
      onRetryProperties={() => void refetchProperties()}
      propertyNames={propertyNames}
      propertyState={propertyState}
      refreshControl={refreshControl}
      rule={rule}
    />
  );
}
