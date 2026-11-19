import { TAX_YEAR_CHANGE_MESSAGES as MESSAGES, TAX_YEAR_CHOICE } from "@mybookkeeper/api-client/constants/taxYearChange";
import type { TaxYearChoice } from "@mybookkeeper/api-client/types/transaction/TaxYearChoice";
import { Alert } from "react-native";

/**
 * A date in another year doesn't move the tax year by itself, so the person says which year the
 * transaction belongs to before it's saved, since it decides which year's tax report it appears in.
 */
export function confirmTaxYearChange(currentYear: number, newYear: number): Promise<TaxYearChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      MESSAGES.title(newYear),
      MESSAGES.body(currentYear, newYear),
      [
        { text: MESSAGES.keepEditing, style: "cancel", onPress: () => resolve(TAX_YEAR_CHOICE.cancel) },
        { text: MESSAGES.keep(currentYear), onPress: () => resolve(TAX_YEAR_CHOICE.keep) },
        { text: MESSAGES.move(newYear), onPress: () => resolve(TAX_YEAR_CHOICE.move) },
      ],
      { cancelable: true, onDismiss: () => resolve(TAX_YEAR_CHOICE.cancel) },
    );
  });
}
