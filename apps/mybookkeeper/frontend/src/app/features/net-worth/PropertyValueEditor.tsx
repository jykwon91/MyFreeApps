import { useId, useState } from "react";
import { Button, LoadingButton, showError, showSuccess } from "@platform/ui";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { useSetPropertyEstimatedValueMutation } from "@mybookkeeper/api-client/store/netWorthApi";
import type { NetWorthLine } from "@mybookkeeper/api-client/types/net-worth/net-worth-line";
import { centsToBalanceText } from "@mybookkeeper/api-client/utils/financialAccountForm";
import { moneyInputError } from "@mybookkeeper/api-client/utils/moneyInputError";
import { moneyTextToCents } from "@mybookkeeper/api-client/utils/moneyTextToCents";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

export interface PropertyValueEditorProps {
  line: NetWorthLine;
  onDone: () => void;
}

type ValueWrite = "save" | "remove";

/** What a property is worth, typed by the person; saving dates it today. Never prefilled from the purchase price. */
export default function PropertyValueEditor({ line, onDone }: PropertyValueEditorProps) {
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState(centsToBalanceText(line.amount_cents));
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<ValueWrite | null>(null);
  const [setValue] = useSetPropertyEstimatedValueMutation();

  async function write(cents: number | null, action: ValueWrite) {
    setPending(action);
    try {
      await setValue({ propertyId: line.id, data: { estimated_value_cents: cents } }).unwrap();
      showSuccess(cents === null ? MSG.valueRemoved : MSG.valueSaved);
      onDone();
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.valueSaveFailed));
      setPending(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = moneyInputError(text, NUMBER_INPUT_DECIMAL_SEPARATOR);
    setProblem(error);
    const cents = moneyTextToCents(text, NUMBER_INPUT_DECIMAL_SEPARATOR);
    if (error !== undefined || cents === null || cents === undefined) return;
    void write(cents, "save");
  }

  const busy = pending !== null;
  return (
    <form noValidate onSubmit={handleSubmit} className="mt-3 space-y-2" data-testid="property-value-editor">
      <label htmlFor={inputId} className="block text-sm font-medium">{MSG.valueLabel(line.name)}</label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={problem !== undefined}
        aria-describedby={hintId}
        className="w-full sm:w-56 min-h-[44px] border rounded-md px-3 py-2 text-sm bg-background"
        data-testid="property-value-input"
      />
      <p id={hintId} className={`text-xs ${problem === undefined ? "text-muted-foreground" : "text-destructive"}`} data-testid="property-value-hint">
        {problem ?? MSG.valueHint}
      </p>
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          type="submit" variant="primary" size="sm" className="min-h-[44px]"
          isLoading={pending === "save"} loadingText={MSG.saving} disabled={busy}
          data-testid="property-value-save"
        >
          {MSG.save}
        </LoadingButton>
        {line.amount_cents !== null ? (
          <LoadingButton
            type="button" variant="secondary" size="sm" className="min-h-[44px]"
            isLoading={pending === "remove"} loadingText={MSG.saving} disabled={busy}
            onClick={() => void write(null, "remove")} data-testid="property-value-remove"
          >
            {MSG.removeValue}
          </LoadingButton>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={onDone} disabled={busy}>
          {MSG.cancel}
        </Button>
      </div>
    </form>
  );
}
