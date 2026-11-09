import { Alert } from "react-native";
import type { TaxYearChoice } from "../../types/TaxYearChoice";

/**
 * A date in another year doesn't move the tax year by itself, so the person says which year the
 * transaction belongs to before it's saved, since it decides which year's tax report it appears in.
 */
export function confirmTaxYearChange(currentYear: number, newYear: number): Promise<TaxYearChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      `Move it to tax year ${newYear}?`,
      `The new date is in ${newYear}, but this is filed under tax year ${currentYear}. That decides which year's tax report it shows up in.`,
      [
        { text: "Keep editing", style: "cancel", onPress: () => resolve("cancel") },
        { text: `Keep ${currentYear}`, onPress: () => resolve("keep") },
        { text: `Move to ${newYear}`, onPress: () => resolve("move") },
      ],
      { cancelable: true, onDismiss: () => resolve("cancel") },
    );
  });
}
