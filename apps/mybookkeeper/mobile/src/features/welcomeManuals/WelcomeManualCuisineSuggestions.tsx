import { LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { cuisineSuggestionLabel } from "../../constants/welcomeManualForms";

interface WelcomeManualCuisineSuggestionsProps {
  /** Cuisines the manual already uses that fit what is being typed. */
  suggestions: readonly string[];
  onPick: (cuisine: string) => void;
}

export default function WelcomeManualCuisineSuggestions({ suggestions, onPick }: WelcomeManualCuisineSuggestionsProps) {
  const { spacing } = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {suggestions.map((cuisine) => (
        <LoadingButton accessibilityLabel={cuisineSuggestionLabel(cuisine)} key={cuisine} onPress={() => onPick(cuisine)} variant="secondary">
          {cuisine}
        </LoadingButton>
      ))}
    </View>
  );
}
