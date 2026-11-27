import { LoadingButton, showError, showSuccess } from "@platform/ui";
import { useSetSavingsResearchEnabledMutation } from "@mybookkeeper/api-client/store/savingsApi";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";

export interface SavingsResearchToggleProps {
  /** The state the button switches research to. */
  turnOn: boolean;
}

/** Turns daily research on or off; the response is the new overview, so the page switches at once. */
export default function SavingsResearchToggle({ turnOn }: SavingsResearchToggleProps) {
  const [setEnabled, { isLoading }] = useSetSavingsResearchEnabledMutation();

  async function handleClick() {
    try {
      await setEnabled(turnOn).unwrap();
      showSuccess(turnOn ? MSG.turnedOn : MSG.turnedOff);
    } catch {
      showError(MSG.toggleFailed);
    }
  }

  return (
    <LoadingButton
      type="button"
      variant={turnOn ? "primary" : "ghost"}
      isLoading={isLoading}
      loadingText={turnOn ? MSG.turningOn : MSG.turningOff}
      onClick={() => void handleClick()}
      data-testid={turnOn ? "savings-turn-on" : "savings-turn-off"}
    >
      {turnOn ? MSG.turnOn : MSG.turnOff}
    </LoadingButton>
  );
}
