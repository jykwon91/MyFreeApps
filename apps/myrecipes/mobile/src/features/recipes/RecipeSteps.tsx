import type { StepResponse } from "@myrecipes/api-client/types/recipe/step";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { byPosition } from "../../utils/byPosition";
import RecipeSectionHeading from "./RecipeSectionHeading";

export default function RecipeSteps({ steps }: { steps: StepResponse[] }) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <RecipeSectionHeading>Steps</RecipeSectionHeading>
      {steps.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontStyle: "italic" }}>
          No steps.
        </Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          {byPosition(steps).map((step, index) => (
            <View
              accessibilityLabel={`Step ${index + 1}. ${step.instruction}`}
              accessible
              key={step.id}
              style={{ flexDirection: "row", gap: spacing.md }}
            >
              <View
                style={{
                  alignSelf: "flex-start",
                  alignItems: "center",
                  minWidth: fontSize.md * 1.75,
                  padding: spacing.xs,
                  borderRadius: radius.md,
                  backgroundColor: colors.muted,
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: fontSize.sm, fontWeight: "600" }}>
                  {index + 1}
                </Text>
              </View>
              <Text style={{ flex: 1, color: colors.foreground, fontSize: fontSize.md }}>
                {step.instruction}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
