import { NO_PLACE_FILTERS } from "@mybookkeeper/api-client/utils/welcomeManualPlaces";
import { FormSheet, LoadingButton, OptionRow, SegmentedControl, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { WELCOME_MANUAL_PREVIEW_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import type { WelcomeManualPlaceFilterSheetProps } from "../../types/WelcomeManualPlaceFilterSheetProps";

/** Cuisine and price, chosen in a sheet so the search box and the places keep the screen. Choices apply as they are made. */
export default function WelcomeManualPlaceFilterSheet({ filters, cuisines, priceTiers, onChange, onClose }: WelcomeManualPlaceFilterSheetProps) {
  const { colors, fontSize, spacing } = useTheme();
  const prices = [{ value: "", label: MESSAGES.anyPrice }, ...priceTiers.map((tier) => ({ value: tier as string, label: tier }))];
  return (
    <FormSheet isOpen onRequestClose={onClose} title={MESSAGES.filterTitle}>
      {priceTiers.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.priceLabel}</Text>
          <SegmentedControl
            accessibilityLabel={MESSAGES.priceLabel}
            onChange={(value) => onChange({ ...filters, priceTier: priceTiers.find((tier) => tier === value) ?? null })}
            segments={prices}
            value={filters.priceTier ?? ""}
          />
        </View>
      ) : null}
      <View>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.cuisineLabel}</Text>
        <OptionRow isSelected={filters.cuisine === null} label={MESSAGES.allCuisines} onPress={() => onChange({ ...filters, cuisine: null })} />
        {cuisines.map((cuisine) => (
          <OptionRow isSelected={filters.cuisine === cuisine} key={cuisine} label={cuisine} onPress={() => onChange({ ...filters, cuisine })} />
        ))}
      </View>
      <LoadingButton onPress={() => onChange({ ...NO_PLACE_FILTERS, search: filters.search })} variant="secondary">
        {MESSAGES.clearFilters}
      </LoadingButton>
      <LoadingButton onPress={onClose}>{MESSAGES.done}</LoadingButton>
    </FormSheet>
  );
}
