import { SegmentedControl, useTheme } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import { MONEY_SEGMENTS, type MoneySegment } from "../../constants/moneySegments";
import DocumentsScreen from "../documents/DocumentsScreen";
import ComingToAppScreen from "../shell/ComingToAppScreen";

export default function MoneyScreen() {
  const { colors, spacing } = useTheme();
  const [segment, setSegment] = useState<MoneySegment>("documents");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SegmentedControl accessibilityLabel="Money" onChange={setSegment} segments={MONEY_SEGMENTS} value={segment} />
      </View>
      <View style={{ flex: 1 }}>
        {segment === "documents" ? <DocumentsScreen /> : <ComingToAppScreen title="Transactions" webPath="/transactions" />}
      </View>
    </View>
  );
}
