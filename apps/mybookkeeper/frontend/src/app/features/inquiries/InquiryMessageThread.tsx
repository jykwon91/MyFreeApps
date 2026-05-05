import { ChevronDown, ChevronUp } from "lucide-react";
import { formatAbsoluteTime } from "@/shared/lib/inquiry-date-format";
import type { InquiryMessage } from "@/shared/types/inquiry/inquiry-message";

export interface InquiryMessageThreadProps {
  messages: InquiryMessage[];
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  in_app: "In-app",
};

/**
 * Renders the inquiry's email/SMS thread chronologically (oldest first).
 *
 * SECURITY: every body is rendered as plaintext — never via
 * ``dangerouslySetInnerHTML``. Inbound bodies originate from external
 * platforms (FF / TNH / Gmail) and could contain hostile HTML or scripts.
 * Manual inquiries created via this PR will normally have no messages at
 * all; PR 2.2 populates the thread for parsed FF/TNH emails.
 */
export default function InquiryMessageThread({ messages }: InquiryMessageThreadProps) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No messages yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="inquiry-message-thread">
      {messages.map((msg) => {
        const inbound = msg.direction === "inbound";
        const Icon = inbound ? ChevronDown : ChevronUp;
        const channelLabel = CHANNEL_LABELS[msg.channel] ?? msg.channel;
        const sentAt = msg.sent_at ?? msg.created_at;
        // PR 2.2 will populate parsed_body; until then we fall back to
        // raw_email_body so manual entries (and outbound replies in PR 2.3)
        // still render something readable.
        const body = msg.parsed_body ?? msg.raw_email_body ?? "";
        return (
          <li
            key={msg.id}
            data-testid={`inquiry-message-${msg.id}`}
            className="border rounded-lg p-3 text-sm"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-medium">
                {inbound ? "From" : "To"}: {inbound ? msg.from_address ?? "—" : msg.to_address ?? "—"}
              </span>
              <span aria-hidden="true">·</span>
              <span>{channelLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{formatAbsoluteTime(sentAt)}</span>
            </div>
            {msg.subject ? (
              <p className="font-medium mb-1 text-sm">{msg.subject}</p>
            ) : null}
            <p className="whitespace-pre-line text-sm text-foreground">{body}</p>
          </li>
        );
      })}
    </ul>
  );
}
