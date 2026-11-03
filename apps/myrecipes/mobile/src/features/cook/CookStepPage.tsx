import { useTheme } from "@platform/mobile";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COOK_STEP_LINE_HEIGHT } from "../../constants/cook";

function ignoreLongPress(): void {}

export default function CookStepPage({
  areTapZonesEnabled,
  instruction,
  onBack,
  onNext,
}: {
  areTapZonesEnabled: boolean;
  instruction: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} persistentScrollbar testID="cook-step-scroll">
      <View style={{ flexGrow: 1 }}>
        {/* Behind the text, inside the scroll, so a drag scrolls and a tap turns the page. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { flexDirection: "row" }]}
        >
          <Pressable
            accessible={false}
            disabled={!areTapZonesEnabled}
            onLongPress={ignoreLongPress}
            onPress={onBack}
            style={{ flex: 1 }}
            testID="cook-tap-back"
          />
          <Pressable
            accessible={false}
            disabled={!areTapZonesEnabled}
            onLongPress={ignoreLongPress}
            onPress={onNext}
            style={{ flex: 1 }}
            testID="cook-tap-next"
          />
        </View>
        <View pointerEvents="none" style={{ padding: spacing.lg }}>
          <Text
            style={{
              color: colors.foreground,
              fontSize: fontSize.xl,
              lineHeight: COOK_STEP_LINE_HEIGHT,
            }}
          >
            {instruction}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
