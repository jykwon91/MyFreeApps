import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { matchTypeLabel, ruleSourceLabel } from "@mybookkeeper/api-client/utils/classificationRules";
import type { VendorRulePropertyState } from "../../types/VendorRulePropertyState";
import { Banner, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useTheme } from "@platform/mobile";
import { type ReactElement, useRef } from "react";
import { type RefreshControlProps, ScrollView, Text, View } from "react-native";
import { DELETE_VENDOR_RULE_BODY, deleteVendorRuleTitle, VENDOR_RULE_MESSAGES as MESSAGES } from "../../constants/vendorRules";
import { askOnce } from "../../lib/askOnce";
import { categoryLabel } from "../transactions/transactionDisplay";
import TransactionFact from "../transactions/TransactionFact";
import { propertyFactText, timesUsedText } from "./vendorRuleDisplay";
import { useVendorRuleActions } from "./useVendorRuleActions";

interface VendorRuleDetailBodyProps {
  rule: ClassificationRule;
  propertyNames: ReadonlyMap<string, string>;
  propertyState: VendorRulePropertyState;
  onRetryProperties: () => void;
  /** Only owners and admins can delete; everyone else just reads. */
  canDelete: boolean;
  /** A reload failed, so what's shown is what was last loaded. */
  hasStaleData: boolean;
  refreshControl: ReactElement<RefreshControlProps>;
  onDeleted: () => void;
}

export default function VendorRuleDetailBody({ rule, propertyNames, propertyState, onRetryProperties, canDelete, hasStaleData, refreshControl, onDeleted }: VendorRuleDetailBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const asking = useRef(false);
  const actions = useVendorRuleActions(rule.id, onDeleted);

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {hasStaleData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {actions.failure ? <Banner message={actions.failure} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {rule.match_pattern}
        </Text>
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{matchTypeLabel(rule.match_type)}</Text>
      </View>
      <TransactionFact label={MESSAGES.category} value={categoryLabel(rule.category)} />
      <TransactionFact label={MESSAGES.property} value={propertyFactText(rule.property_id, propertyState, propertyNames)} />
      {rule.property_id !== null && propertyState === "failed" ? (
        <LoadingButton onPress={onRetryProperties} variant="secondary">
          {MESSAGES.tryAgain}
        </LoadingButton>
      ) : null}
      {rule.match_context ? <TransactionFact label={MESSAGES.context} value={rule.match_context} /> : null}
      <TransactionFact label={MESSAGES.source} value={ruleSourceLabel(rule.source)} />
      <TransactionFact label={MESSAGES.timesApplied} value={timesUsedText(rule.times_applied)} />
      <TransactionFact label={MESSAGES.active} value={rule.is_active ? MESSAGES.activeYes : MESSAGES.activeNo} />
      <TransactionFact label={MESSAGES.added} value={formatLongDate(rule.created_at)} />
      {canDelete ? (
        <LoadingButton
          isLoading={actions.isDeleting}
          loadingText={MESSAGES.deleting}
          onPress={() =>
            askOnce(asking, deleteVendorRuleTitle(rule.match_pattern), DELETE_VENDOR_RULE_BODY, {
              text: MESSAGES.delete,
              style: "destructive",
              onPress: () => void actions.remove(),
            })
          }
          variant="destructive"
        >
          {MESSAGES.delete}
        </LoadingButton>
      ) : (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text>
      )}
    </ScrollView>
  );
}
