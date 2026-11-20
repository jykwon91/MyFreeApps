import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@platform/ui";
import { TAX_YEAR_CHANGE_MESSAGES as MSG, TAX_YEAR_CHOICE } from "@mybookkeeper/api-client/constants/taxYearChange";
import type { TaxYearChoice } from "@mybookkeeper/api-client/types/transaction/TaxYearChoice";
import type { TaxYearQuestion } from "@/shared/types/transaction/tax-year-question";

export interface TaxYearChangeDialogProps {
  question: TaxYearQuestion | null;
  onChoose: (choice: TaxYearChoice) => void;
}

/**
 * Asks which tax year a transaction files under after its date moved to another year, in the
 * phone's words. Escape or a click outside means "Keep editing", so nothing is saved by accident.
 * Sits above the unsaved-changes prompt, whose "Save & close" can raise it.
 */
export default function TaxYearChangeDialog({ question, onChoose }: TaxYearChangeDialogProps) {
  if (!question) return null;
  const { currentYear, newYear } = question;
  return (
    <Dialog.Root
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onChoose(TAX_YEAR_CHOICE.cancel);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[80]" />
        <Dialog.Content
          role="alertdialog"
          data-testid="tax-year-change-dialog"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[calc(100%-2rem)] max-w-md rounded-lg border bg-card p-6 shadow-lg focus:outline-none"
        >
          <Dialog.Title className="text-base font-semibold">{MSG.title(newYear)}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-2">
            {MSG.body(currentYear, newYear)}
          </Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              variant="ghost"
              size="md"
              onClick={() => onChoose(TAX_YEAR_CHOICE.cancel)}
              className="min-h-[44px] px-3 sm:mr-auto"
            >
              {MSG.keepEditing}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => onChoose(TAX_YEAR_CHOICE.keep)}
              className="min-h-[44px]"
            >
              {MSG.keep(currentYear)}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => onChoose(TAX_YEAR_CHOICE.move)}
              className="min-h-[44px]"
            >
              {MSG.move(newYear)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
