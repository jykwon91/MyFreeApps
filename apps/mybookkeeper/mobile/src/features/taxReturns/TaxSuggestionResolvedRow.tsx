import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../constants/taxAdvisor";

export default function TaxSuggestionResolvedRow({ title }: { title: string }) {
  const { colors, fontSize } = useTheme();
  return <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.resolvedLine(title)}</Text>;
}
