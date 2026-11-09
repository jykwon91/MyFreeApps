import { useCreateTaxReturnMutation } from "@mybookkeeper/api-client/store/taxReturnsApi";
import { useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { TAX_RETURN_CREATE_MESSAGES as MESSAGES } from "../../constants/taxReturnCreate";
import type { CreateTarget } from "../../types/CreateTarget";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

/** Starts a return and opens it once it exists. */
export function useCreateTaxReturn() {
  const { showToast } = useToast();
  const [createReturn] = useCreateTaxReturnMutation();
  const write = useWrite();
  const [created, setCreated] = useState<string | null>(null);
  const [lastYear, setLastYear] = useState<number | null>(null);

  // Opens the new return a render after the save, or the discard question still sees the unsaved choices.
  useEffect(() => {
    if (created) router.replace(`/tax-returns/${created}`);
  }, [created]);

  async function create({ taxYear, filingStatus }: CreateTarget): Promise<void> {
    setLastYear(taxYear);
    let id = "";
    const result = await write.run(
      async () => {
        id = (await createReturn({ tax_year: taxYear, filing_status: filingStatus }).unwrap()).id;
      },
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(MESSAGES.created(taxYear), "success");
    setCreated(id);
  }

  const copy = { ...saveFailureCopy("tax return", "tax returns", true), conflict: lastYear === null ? "" : MESSAGES.alreadyHave(lastYear) };
  return { create, isBusy: write.isBusy, isLeaving: created !== null, failure: write.failure ? copy[write.failure] : null };
}
