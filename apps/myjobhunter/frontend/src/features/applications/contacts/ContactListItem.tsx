import { Link2, Mail, Trash2 } from "lucide-react";
import { Badge } from "@platform/ui";
import { contactDisplayName } from "@myjobhunter/api-client/utils/contactDisplayName";
import { contactEmailUrl, contactProfileUrl } from "@myjobhunter/api-client/utils/contactLinkUrls";
import { formatContactRole } from "@myjobhunter/api-client/utils/formatContactRole";
import { CONTACT_MESSAGES as MESSAGES } from "@/constants/contact-messages";
import type { ContactListItemProps } from "@/types/contact/contact-list-item-props";

/** One person: name, role, how to reach them, notes, and Remove. Only plain-address mailto and http(s) links open. */
export default function ContactListItem({ contact, onRemove, isRemoving }: ContactListItemProps) {
  const name = contactDisplayName(contact) ?? MESSAGES.unnamed;
  const roleLabel = formatContactRole(contact.role);
  const emailUrl = contact.email ? contactEmailUrl(contact.email) : null;
  const profileUrl = contact.linkedin_url ? contactProfileUrl(contact.linkedin_url) : null;

  return (
    <li className="border rounded-lg p-3" data-testid={`contact-${contact.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          {roleLabel ? <Badge label={roleLabel} color="blue" /> : null}
        </div>
        <button
          type="button"
          onClick={() => onRemove(contact)}
          disabled={isRemoving}
          aria-label={MESSAGES.removeLabel(name)}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
        {contact.email ? (
          emailUrl ? (
            <a
              href={emailUrl}
              aria-label={MESSAGES.emailLinkLabel(name)}
              className="inline-flex items-center gap-1 min-h-[44px] text-primary hover:underline"
            >
              <Mail size={12} aria-hidden="true" />
              {contact.email}
            </a>
          ) : (
            <span className="break-all">{contact.email}</span>
          )
        ) : null}
        {contact.linkedin_url ? (
          profileUrl ? (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={MESSAGES.linkedInLinkLabel(name)}
              className="inline-flex items-center gap-1 min-h-[44px] text-primary hover:underline"
            >
              <Link2 size={12} aria-hidden="true" />
              {MESSAGES.linkedIn}
            </a>
          ) : (
            <span className="break-all">{contact.linkedin_url}</span>
          )
        ) : null}
      </div>
      {contact.notes ? (
        <p className="text-xs mt-2 whitespace-pre-wrap text-muted-foreground">{contact.notes}</p>
      ) : null}
    </li>
  );
}
