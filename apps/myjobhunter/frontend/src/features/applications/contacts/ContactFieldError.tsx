import type { ContactFieldErrorProps } from "@/types/contact/contact-field-error-props";

/** What's wrong with one add-contact field, tied to its input by `id`. */
export default function ContactFieldError({ id, message }: ContactFieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive mt-1">
      {message}
    </p>
  );
}
