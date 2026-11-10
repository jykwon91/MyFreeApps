import { CLASSIFICATION_LABELS, TYPE_LABELS } from "@mybookkeeper/api-client/constants/propertyLabels";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { Banner, Chip, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { type ReactElement, useRef } from "react";
import { type RefreshControlProps, ScrollView, Text, View } from "react-native";
import { DELETE_PROPERTY_BODY, deletePropertyTitle, PROPERTY_MESSAGES } from "../../constants/properties";
import { askOnce } from "../../lib/askOnce";
import TransactionFact from "../transactions/TransactionFact";
import { activityPeriodText, needsClassification } from "./propertyDisplay";
import { usePropertyActions } from "./usePropertyActions";

interface PropertyDetailBodyProps {
  property: Property;
  canWrite: boolean;
  /** A reload failed, so what's shown is what was last loaded. */
  hasStaleData: boolean;
  refreshControl: ReactElement<RefreshControlProps>;
  onDeleted: () => void;
}

export default function PropertyDetailBody({ property, canWrite, hasStaleData, refreshControl, onDeleted }: PropertyDetailBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const asking = useRef(false);
  const actions = usePropertyActions(property, onDeleted);
  const isBusy = actions.isToggling || actions.isDeleting;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {hasStaleData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {actions.failure ? <Banner message={actions.failure} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {property.name}
        </Text>
        {property.address ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{property.address}</Text> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {property.is_active ? null : <Chip label={PROPERTY_MESSAGES.inactive} />}
          {needsClassification(property) ? <Chip label={PROPERTY_MESSAGES.needsClassification} /> : null}
        </View>
      </View>
      {needsClassification(property) ? null : (
        <TransactionFact
          label={PROPERTY_MESSAGES.use}
          value={property.type ? `${CLASSIFICATION_LABELS[property.classification]} · ${TYPE_LABELS[property.type]}` : CLASSIFICATION_LABELS[property.classification]}
        />
      )}
      {property.activity_periods.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{PROPERTY_MESSAGES.activityPeriods}</Text>
          {property.activity_periods.map((period) => (
            <Text key={period.id} style={{ fontSize: fontSize.md, color: colors.foreground }}>
              {activityPeriodText(period)}
            </Text>
          ))}
        </View>
      ) : null}
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton disabled={isBusy} onPress={() => router.push(`/properties/${property.id}/edit`)}>
            {PROPERTY_MESSAGES.edit}
          </LoadingButton>
          <LoadingButton
            disabled={isBusy}
            isLoading={actions.isToggling}
            loadingText={property.is_active ? PROPERTY_MESSAGES.deactivating : PROPERTY_MESSAGES.activating}
            onPress={() => void actions.toggleActive()}
            variant="secondary"
          >
            {property.is_active ? PROPERTY_MESSAGES.deactivate : PROPERTY_MESSAGES.activate}
          </LoadingButton>
          <LoadingButton
            disabled={isBusy}
            isLoading={actions.isDeleting}
            loadingText={PROPERTY_MESSAGES.deleting}
            onPress={() =>
              askOnce(asking, deletePropertyTitle(property.name), DELETE_PROPERTY_BODY, {
                text: PROPERTY_MESSAGES.delete,
                style: "destructive",
                onPress: () => void actions.remove(),
              })
            }
            variant="destructive"
          >
            {PROPERTY_MESSAGES.delete}
          </LoadingButton>
        </View>
      ) : null}
    </ScrollView>
  );
}
