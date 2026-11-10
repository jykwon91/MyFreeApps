import { useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmDialog, extractErrorMessage, isNotFound, showError, showSuccess } from "@platform/ui";
import { useRemoveApplicationContactMutation } from "@myjobhunter/api-client/store/applicationsApi";
import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";
import { contactDisplayName } from "@myjobhunter/api-client/utils/contactDisplayName";
import { CONTACT_MESSAGES as MESSAGES } from "@/constants/contact-messages";
import type { ContactsManagerProps } from "@/types/contact/contacts-manager-props";
import AddContactDialog from "./AddContactDialog";
import ContactListItem from "./ContactListItem";

/**
 * The people on an application: list them, add one, remove one after asking.
 * Shared by the ApplicationDrawer and the full ApplicationDetail page so both behave the same.
 * Contacts come embedded in GET /applications/{id}; adding or removing refetches it
 * (a failed request too, so a contact already removed elsewhere drops off the list).
 */
export default function ContactsManager({ applicationId, contacts }: ContactsManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [removing, setRemoving] = useState<ApplicationContact | null>(null);
  const [removeContact, { isLoading: isRemoving }] = useRemoveApplicationContactMutation();
  const removingName = removing ? (contactDisplayName(removing) ?? MESSAGES.unnamed) : "";

  async function confirmRemove(): Promise<void> {
    if (!removing) return;
    try {
      await removeContact({ applicationId, contactId: removing.id }).unwrap();
      showSuccess(MESSAGES.removed);
      setRemoving(null);
    } catch (err) {
      // A 404 means it's already gone (removed elsewhere, or a double submit): the outcome they asked for.
      if (isNotFound(err)) {
        showSuccess(MESSAGES.removed);
        setRemoving(null);
        return;
      }
      showError(MESSAGES.couldntRemove(extractErrorMessage(err)));
    }
  }

  return (
    <section>
      <header className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-medium">
          {MESSAGES.heading} <span className="text-muted-foreground font-normal">({contacts.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-xs border rounded-md hover:bg-muted"
        >
          <Plus size={12} aria-hidden="true" />
          {MESSAGES.add}
        </button>
      </header>
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">{MESSAGES.none}</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((contact) => (
            <ContactListItem
              key={contact.id}
              contact={contact}
              onRemove={setRemoving}
              isRemoving={isRemoving && removing?.id === contact.id}
            />
          ))}
        </ul>
      )}
      <AddContactDialog applicationId={applicationId} open={isAdding} onOpenChange={setIsAdding} />
      <ConfirmDialog
        open={removing !== null}
        title={MESSAGES.removeTitle}
        description={MESSAGES.removeBody(removingName)}
        confirmLabel={MESSAGES.remove}
        cancelLabel={MESSAGES.keep}
        variant="danger"
        isLoading={isRemoving}
        onConfirm={confirmRemove}
        onCancel={() => (isRemoving ? undefined : setRemoving(null))}
      />
    </section>
  );
}
