import { useCreatePropertyMutation, useUpdatePropertyMutation } from "@mybookkeeper/api-client/store/propertiesApi";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { PropertyForm } from "@mybookkeeper/api-client/types/property/PropertyForm";
import { propertyChanges, toPropertyWrite, trimmedForm } from "@mybookkeeper/api-client/utils/propertyForm";
import { useLeaveWhenSaved, useToast } from "@platform/mobile";
import { PROPERTY_FORM_MESSAGES } from "../../constants/propertyForm";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

/** Adds a property, or saves what changed on `original`, and goes back when it's done. */
export function useSaveProperty(original: Property | null) {
  const { showToast } = useToast();
  const [createProperty] = useCreatePropertyMutation();
  const [updateProperty] = useUpdatePropertyMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved("/properties");
  const copy = saveFailureCopy("property", "properties", original === null);

  async function submit(form: PropertyForm): Promise<void> {
    const changes = original ? propertyChanges(form, original) : null;
    if (original && changes && Object.keys(changes).length === 0) {
      leave();
      return;
    }
    const result = await write.run(
      () => (original && changes ? updateProperty({ id: original.id, data: changes }).unwrap() : createProperty(toPropertyWrite(trimmedForm(form))).unwrap()),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(original ? PROPERTY_FORM_MESSAGES.saved : PROPERTY_FORM_MESSAGES.added);
    leave();
  }

  return { submit, isBusy: write.isBusy, isLeaving, failure: write.failure ? copy[write.failure] : null };
}
