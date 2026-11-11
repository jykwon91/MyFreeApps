import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { X } from "lucide-react";
import { FieldFeedback, fieldFeedbackAria, LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { CONTACT_ROLE_OPTIONS } from "@myjobhunter/api-client/constants/contactRoleOptions";
import { EMPTY_CONTACT_FORM_VALUES } from "@myjobhunter/api-client/constants/emptyContactFormValues";
import { useAddApplicationContactMutation } from "@myjobhunter/api-client/store/applicationsApi";
import type { ContactFormField } from "@myjobhunter/api-client/types/contact/contact-form-field";
import type { ContactFormValues } from "@myjobhunter/api-client/types/contact/contact-form-values";
import { contactFormCounters } from "@myjobhunter/api-client/utils/contactFormCounters";
import { contactCreateRequest } from "@myjobhunter/api-client/utils/contactCreateRequest";
import { contactServerErrors } from "@myjobhunter/api-client/utils/contactServerErrors";
import { CONTACT_MESSAGES as MESSAGES } from "@/constants/contact-messages";
import { contactFormResolver } from "@/lib/contact-form-resolver";
import type { AddContactDialogProps } from "@/types/contact/add-contact-dialog-props";

const INPUT_CLASS = "w-full min-h-[44px] border rounded-md px-3 py-2 text-sm bg-background aria-[invalid=true]:border-destructive";
const LABEL_CLASS = "block text-sm font-medium mb-1";

/**
 * Adds a person to the application. Stays open, with what was typed, when the add fails; a 422
 * puts the server's reason under the field it names. Starts blank each time: the form is cleared
 * when it closes, so nothing from last time shows while it opens.
 * No `maxLength`: a pasted value over the limit would be cut silently, so the validator says so instead.
 * Sits above the drawer (z-60), like ConfirmDialog.
 */
export default function AddContactDialog({ applicationId, open, onOpenChange }: AddContactDialogProps) {
  const [addContact, { isLoading }] = useAddApplicationContactMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<ContactFormValues>({ defaultValues: EMPTY_CONTACT_FORM_VALUES, resolver: contactFormResolver });

  function close(): void {
    reset(EMPTY_CONTACT_FORM_VALUES);
    onOpenChange(false);
  }

  const onSubmit: SubmitHandler<ContactFormValues> = async (values) => {
    try {
      await addContact({ applicationId, body: contactCreateRequest(values) }).unwrap();
      showSuccess(MESSAGES.added);
      close();
    } catch (err) {
      for (const [field, message] of Object.entries(contactServerErrors(err)) as [ContactFormField, string][]) {
        setError(field, { type: "server", message });
      }
      showError(MESSAGES.couldntAdd(extractErrorMessage(err)));
    }
  };

  const counters = contactFormCounters(watch());
  const feedback = (field: ContactFormField) => ({ id: `contact-${field}`, error: errors[field]?.message, counter: counters[field] });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (isLoading) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-[70] p-6">
          <div className="flex items-center justify-between mb-1">
            <Dialog.Title className="text-lg font-semibold">{MESSAGES.dialogTitle}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={MESSAGES.close}
                disabled={isLoading}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">{MESSAGES.dialogDescription}</Dialog.Description>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <fieldset disabled={isLoading} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="contact-name" className={LABEL_CLASS}>{MESSAGES.nameLabel}</label>
                  <input
                    id="contact-name"
                    type="text"
                    autoComplete="off"
                    placeholder={MESSAGES.namePlaceholder}
                    {...fieldFeedbackAria(feedback("name"))}
                    className={INPUT_CLASS}
                    {...register("name")}
                  />
                  <FieldFeedback {...feedback("name")} />
                </div>
                <div>
                  <label htmlFor="contact-email" className={LABEL_CLASS}>{MESSAGES.emailLabel}</label>
                  <input
                    id="contact-email"
                    type="email"
                    autoComplete="off"
                    placeholder={MESSAGES.emailPlaceholder}
                    {...fieldFeedbackAria(feedback("email"))}
                    className={INPUT_CLASS}
                    {...register("email")}
                  />
                  <FieldFeedback {...feedback("email")} />
                </div>
              </div>

              <div>
                <label htmlFor="contact-role" className={LABEL_CLASS}>{MESSAGES.roleLabel}</label>
                <select
                  id="contact-role"
                  {...fieldFeedbackAria(feedback("role"))}
                  className={INPUT_CLASS}
                  {...register("role")}
                >
                  <option value="">{MESSAGES.noRole}</option>
                  {CONTACT_ROLE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <FieldFeedback {...feedback("role")} />
              </div>

              <div>
                <label htmlFor="contact-linkedin" className={LABEL_CLASS}>{MESSAGES.linkedInLabel}</label>
                <input
                  id="contact-linkedin"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder={MESSAGES.linkedInPlaceholder}
                  {...fieldFeedbackAria(feedback("linkedin_url"))}
                  className={INPUT_CLASS}
                  {...register("linkedin_url")}
                />
                <FieldFeedback {...feedback("linkedin_url")} />
              </div>

              <div>
                <label htmlFor="contact-notes" className={LABEL_CLASS}>{MESSAGES.notesLabel}</label>
                <textarea
                  id="contact-notes"
                  rows={3}
                  placeholder={MESSAGES.notesPlaceholder}
                  {...fieldFeedbackAria(feedback("notes"))}
                  className={`${INPUT_CLASS} resize-y`}
                  {...register("notes")}
                />
                <FieldFeedback {...feedback("notes")} />
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                disabled={isLoading}
                className="min-h-[44px] px-4 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
              >
                {MESSAGES.cancel}
              </button>
              <LoadingButton type="submit" isLoading={isLoading} loadingText={MESSAGES.submitting} className="min-h-[44px]">
                {MESSAGES.submit}
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
