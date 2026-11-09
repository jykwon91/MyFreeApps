import type { WelcomeManualPlaceFilters } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-filters";
import type { WelcomeManualPlaceResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-response";
import { filterPlaces, groupPlacesByCuisine, NO_PLACE_FILTERS, placeCuisines, placePriceTiers } from "@mybookkeeper/api-client/utils/welcomeManualPlaces";
import { LoadingButton, SearchField, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { WELCOME_MANUAL_PREVIEW_MESSAGES as MESSAGES, filtersLabel } from "../../constants/welcomeManualForms";
import WelcomeManualPlace from "./WelcomeManualPlace";
import WelcomeManualPlaceFilterSheet from "./WelcomeManualPlaceFilterSheet";

/** The places as a guest browses them: searched by words, narrowed by cuisine and price, grouped by cuisine. */
export default function WelcomeManualPlaceDirectory({ places }: { places: readonly WelcomeManualPlaceResponse[] }) {
  const { colors, spacing, fontSize } = useTheme();
  const [filters, setFilters] = useState<WelcomeManualPlaceFilters>(NO_PLACE_FILTERS);
  const [isFiltering, setIsFiltering] = useState(false);
  if (places.length === 0) return null;
  const groups = groupPlacesByCuisine(filterPlaces(places, filters));
  const activeCount = (filters.cuisine ? 1 : 0) + (filters.priceTier ? 1 : 0);

  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.placesHeading}
      </Text>
      <SearchField
        accessibilityLabel={MESSAGES.searchLabel}
        onChangeText={(search) => setFilters({ ...filters, search })}
        onClear={() => setFilters({ ...filters, search: NO_PLACE_FILTERS.search })}
        placeholder={MESSAGES.searchPlaceholder}
        value={filters.search}
      />
      <LoadingButton onPress={() => setIsFiltering(true)} variant="secondary">
        {filtersLabel(activeCount)}
      </LoadingButton>
      {groups.length === 0 ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.noMatches}</Text> : null}
      {groups.map((group) => (
        <View key={group.cuisine} style={{ gap: spacing.md }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {group.cuisine}
          </Text>
          {group.places.map((place) => (
            <WelcomeManualPlace key={place.id} place={place} />
          ))}
        </View>
      ))}
      {isFiltering ? (
        <WelcomeManualPlaceFilterSheet cuisines={placeCuisines(places)} filters={filters} onChange={setFilters} onClose={() => setIsFiltering(false)} priceTiers={placePriceTiers(places)} />
      ) : null}
    </View>
  );
}
