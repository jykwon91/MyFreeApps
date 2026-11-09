import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";

interface PropertyMultiSheetProps {
  isOpen: boolean;
  properties: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}

/** Each tap counts straight away, so the choice shows in the numbers behind the sheet. */
export default function PropertyMultiSheet({ isOpen, properties, selectedIds, onChange, onClose }: PropertyMultiSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((chosen) => chosen !== id) : [...selectedIds, id]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.propertiesSheetTitle}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}>
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{MESSAGES.done}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {properties.map((property) => (
            <OptionRow isSelected={selectedIds.includes(property.id)} key={property.id} kind="checkbox" label={property.name} onPress={() => toggle(property.id)} />
          ))}
          <View style={{ padding: spacing.lg }}>
            <LoadingButton disabled={selectedIds.length === 0} onPress={() => onChange([])} variant="secondary">
              {MESSAGES.allProperties}
            </LoadingButton>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
