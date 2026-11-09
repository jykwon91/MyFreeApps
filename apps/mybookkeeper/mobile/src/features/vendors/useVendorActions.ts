import { useDeleteVendorMutation, useUpdateVendorMutation } from "@mybookkeeper/api-client/store/vendorsApi";
import type { VendorResponse } from "@mybookkeeper/api-client/types/vendor/vendor-response";
import { useToast } from "@platform/mobile";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy, saveFailureCopy } from "../../lib/writeFailureCopy";

const SAVE_COPY = saveFailureCopy("vendor", "vendors", false);
const DELETE_COPY = deleteFailureCopy("vendor");

/** The quick changes on a vendor's own screen: star or unstar it, or delete it. */
export function useVendorActions(vendor: VendorResponse, onDeleted: () => void) {
  const { showToast } = useToast();
  const [updateVendor] = useUpdateVendorMutation();
  const [deleteVendor] = useDeleteVendorMutation();
  const star = useWrite();
  const removal = useWrite();

  async function setPreferred(preferred: boolean): Promise<void> {
    const result = await star.run(() => updateVendor({ id: vendor.id, data: { preferred } }).unwrap());
    if (result === "done") showToast(preferred ? VENDOR_MESSAGES.markedPreferred : VENDOR_MESSAGES.unmarkedPreferred);
  }

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteVendor(vendor.id).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onDeleted();
    showToast(result === "done" ? VENDOR_MESSAGES.deleted : VENDOR_MESSAGES.alreadyDeleted);
  }

  const failure = star.failure ? SAVE_COPY[star.failure] : removal.failure && removal.failure !== "gone" ? DELETE_COPY[removal.failure] : null;
  return { setPreferred, remove, isStarring: star.isBusy, isDeleting: removal.isBusy, failure };
}
