import { CLASSIFICATION_CHOICES } from "@mybookkeeper/api-client/constants/propertyClassificationChoices";
import { useGetPropertiesQuery, useUpdatePropertyMutation } from "@mybookkeeper/api-client/store/propertiesApi";
import type { PropertyClassification } from "@mybookkeeper/api-client/types/property/PropertyClassification";
import type { PropertyType } from "@mybookkeeper/api-client/types/property/PropertyType";
import { Banner, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { MORTGAGE_RATE_MESSAGES as MESSAGES, RENTAL_TYPE_CHOICES } from "../../constants/mortgageRates";
import { useFormSubmit } from "../shell/useFormSubmit";
import { useCanWrite } from "../workspace/useCanWrite";
import { occupancyFailure } from "./occupancyFailure";

const CHOICES = CLASSIFICATION_CHOICES.filter((choice) => choice.value !== "unclassified");

interface PropertyOccupancyFixerProps {
  propertyId: string;
  /** Re-runs the rate check once the property has an occupancy. */
  onFixed: () => void;
}

/**
 * Set how a property is used without leaving the rate check. It is the one blocker the person
 * can clear in place: a rental and an owner-occupied home are different loan products at
 * different prices. Shown only for a property that really is unclassified, and only to writers.
 */
export default function PropertyOccupancyFixer({ propertyId, onFixed }: PropertyOccupancyFixerProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const { data: properties = [] } = useGetPropertiesQuery();
  const [updateProperty] = useUpdatePropertyMutation();
  const { isBusy, failure, submit } = useFormSubmit();
  const [choice, setChoice] = useState<PropertyClassification | null>(null);
  const [rentalType, setRentalType] = useState<PropertyType>("short_term");

  const property = properties.find((candidate) => candidate.id === propertyId);
  if (!canWrite || !property || property.classification !== "unclassified") return null;

  async function save(): Promise<void> {
    if (!choice) return;
    const landed = await submit(
      () =>
        updateProperty({
          id: propertyId,
          // A rental row is only valid with a letting type, so the answer is sent with it.
          data: { classification: choice, ...(choice === "investment" ? { type: rentalType } : {}) },
        }).unwrap(),
      occupancyFailure,
    );
    if (!landed) return;
    showToast(MESSAGES.occupancySaved);
    onFixed();
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {failure ? <Banner message={failure} /> : null}
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.occupancyUse}</Text>
      <View accessibilityLabel={MESSAGES.occupancyUse} accessibilityRole="radiogroup">
        {CHOICES.map((option) => (
          <OptionRow
            isSelected={choice === option.value}
            key={option.value}
            label={option.label}
            onPress={() => {
              if (!isBusy) setChoice(option.value);
            }}
          />
        ))}
      </View>
      {choice === "investment" ? (
        <View accessibilityLabel={MESSAGES.occupancyRentalType} accessibilityRole="radiogroup">
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.occupancyRentalType}</Text>
          {RENTAL_TYPE_CHOICES.map((option) => (
            <OptionRow
              isSelected={rentalType === option.value}
              key={option.value}
              label={option.label}
              onPress={() => {
                if (!isBusy) setRentalType(option.value);
              }}
            />
          ))}
        </View>
      ) : null}
      <LoadingButton disabled={!choice} isLoading={isBusy} loadingText={MESSAGES.occupancySaving} onPress={() => void save()}>
        {MESSAGES.occupancySave}
      </LoadingButton>
    </View>
  );
}
