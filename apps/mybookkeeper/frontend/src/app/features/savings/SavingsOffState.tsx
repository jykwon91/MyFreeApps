import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import SavingsResearchToggle from "./SavingsResearchToggle";

/** Research is off: what turning it on sends, and to whom, before the switch. */
export default function SavingsOffState() {
  return (
    <section className="border rounded-lg p-6 space-y-4 max-w-2xl" data-testid="savings-off">
      <h2 className="text-lg font-semibold">{MSG.offTitle}</h2>
      <p className="text-sm text-muted-foreground">{MSG.offBody}</p>
      <SavingsResearchToggle turnOn />
    </section>
  );
}
