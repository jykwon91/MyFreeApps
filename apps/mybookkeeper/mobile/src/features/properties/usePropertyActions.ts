import { useDeletePropertyMutation, useUpdatePropertyMutation } from "@mybookkeeper/api-client/store/propertiesApi";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { useToast } from "@platform/mobile";
import { PROPERTY_MESSAGES } from "../../constants/properties";
import { deleteFailureCopy, saveFailureCopy } from "../../lib/writeFailureCopy";
import { useWrite } from "../../lib/useWrite";

const SAVE_COPY = saveFailureCopy("property", "properties", false);
const DELETE_COPY = deleteFailureCopy("property");

/** The quick changes on a property's own screen: turn it on or off, or delete it. */
export function usePropertyActions(property: Property, onDeleted: () => void) {
  const { showToast } = useToast();
  const [updateProperty] = useUpdatePropertyMutation();
  const [deleteProperty] = useDeletePropertyMutation();
  const toggle = useWrite();
  const removal = useWrite();

  async function toggleActive(): Promise<void> {
    const nextActive = !property.is_active;
    const result = await toggle.run(() => updateProperty({ id: property.id, data: { is_active: nextActive } }).unwrap());
    if (result === "done") showToast(nextActive ? PROPERTY_MESSAGES.activated : PROPERTY_MESSAGES.deactivated);
  }

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteProperty(property.id).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onDeleted();
    showToast(result === "done" ? PROPERTY_MESSAGES.deleted : PROPERTY_MESSAGES.alreadyDeleted);
  }

  const failure = toggle.failure ? SAVE_COPY[toggle.failure] : removal.failure && removal.failure !== "gone" ? DELETE_COPY[removal.failure] : null;
  return { toggleActive, remove, isToggling: toggle.isBusy, isDeleting: removal.isBusy, failure };
}
