import { useCreateVendorMutation, useUpdateVendorMutation } from "@mybookkeeper/api-client/store/vendorsApi";
import type { VendorFormValues } from "@mybookkeeper/api-client/types/vendor/vendor-form-values";
import type { VendorResponse } from "@mybookkeeper/api-client/types/vendor/vendor-response";
import { formValuesToCreateRequest, formValuesToUpdateRequest, vendorDirtyFields, vendorToFormValues } from "@mybookkeeper/api-client/utils/vendorForm";
import { useLeaveWhenSaved, useToast } from "@platform/mobile";
import { VENDOR_FORM_MESSAGES } from "../../constants/vendorForm";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

/** Adds a vendor, or saves what changed on `original`, and goes back when it's done. */
export function useSaveVendor(original: VendorResponse | null) {
  const { showToast } = useToast();
  const [createVendor] = useCreateVendorMutation();
  const [updateVendor] = useUpdateVendorMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved("/vendors");
  const copy = saveFailureCopy("vendor", "vendors", original === null);

  async function submit(values: VendorFormValues): Promise<void> {
    const dirty = original ? vendorDirtyFields(values, vendorToFormValues(original)) : null;
    if (original && dirty && Object.keys(dirty).length === 0) {
      leave();
      return;
    }
    const result = await write.run(
      () =>
        original && dirty
          ? updateVendor({ id: original.id, data: formValuesToUpdateRequest(values, dirty) }).unwrap()
          : createVendor(formValuesToCreateRequest(values)).unwrap(),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(original ? VENDOR_FORM_MESSAGES.saved : VENDOR_FORM_MESSAGES.added);
    leave();
  }

  return { submit, isBusy: write.isBusy, isLeaving, failure: write.failure ? copy[write.failure] : null };
}
