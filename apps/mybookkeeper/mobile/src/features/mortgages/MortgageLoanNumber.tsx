import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { maskedLoanNumber } from "./mortgageDisplay";

/** Stays hidden until asked for, since people glance at this screen with others around. */
export default function MortgageLoanNumber({ loanNumber }: { loanNumber: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const [isShown, setIsShown] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MORTGAGE_MESSAGES.loanNumber}</Text>
        <Text selectable={isShown} style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {isShown ? loanNumber : maskedLoanNumber(loanNumber)}
        </Text>
      </View>
      <LoadingButton
        accessibilityLabel={isShown ? MORTGAGE_MESSAGES.hideLoanNumberName : MORTGAGE_MESSAGES.showLoanNumberName}
        onPress={() => setIsShown((shown) => !shown)}
        variant="ghost"
      >
        {isShown ? MORTGAGE_MESSAGES.hideLoanNumber : MORTGAGE_MESSAGES.showLoanNumber}
      </LoadingButton>
    </View>
  );
}
