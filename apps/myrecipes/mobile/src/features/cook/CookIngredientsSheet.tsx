import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";
import { useTheme } from "@platform/mobile";
import { Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CookBarButton from "./CookBarButton";
import CookIngredientList from "./CookIngredientList";

export default function CookIngredientsSheet({
  checked,
  ingredients,
  isAnimated,
  onClose,
  onToggle,
}: {
  checked: string[];
  ingredients: IngredientResponse[];
  isAnimated: boolean;
  onClose: () => void;
  onToggle: (ingredientId: string) => void;
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <Modal
      animationType={isAnimated ? "slide" : "none"}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      testID="cook-ingredients-sheet"
      visible
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: spacing.lg,
            paddingRight: spacing.sm,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}
          >
            Ingredients
          </Text>
          <CookBarButton label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
          <CookIngredientList checked={checked} ingredients={ingredients} onToggle={onToggle} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
