import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";
import { useTheme } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import CollapsibleSection from "./CollapsibleSection";
import { arrangeMessages, eventLabel, messageBody, qualityFactors, receivedAgo } from "./inquiryDisplay";
import InquiryLine from "./InquiryLine";
import InquirySpamChecks from "./InquirySpamChecks";

/** What most people never need: the history, the spam checks and the quality score. */
export default function InquiryExtras({ inquiry }: { inquiry: InquiryResponse }) {
  const { spacing } = useTheme();
  const [hasOpenedChecks, setHasOpenedChecks] = useState(false);
  const { first } = arrangeMessages(inquiry.messages);
  const factors = qualityFactors({
    desired_start_date: inquiry.desired_start_date,
    desired_end_date: inquiry.desired_end_date,
    inquirer_employer: inquiry.inquirer_employer,
    last_message_body: first?.direction === "inbound" ? messageBody(first) : null,
  });
  return (
    <View style={{ gap: spacing.sm }}>
      <CollapsibleSection title="Activity">
        <View style={{ gap: spacing.xs }}>
          {inquiry.events.length === 0 ? <InquiryLine left="Nothing yet." muted /> : null}
          {inquiry.events.map((event) => (
            <InquiryLine key={event.id} left={eventLabel(event)} right={receivedAgo(event.occurred_at)} />
          ))}
        </View>
      </CollapsibleSection>
      <CollapsibleSection onOpen={() => setHasOpenedChecks(true)} title="Spam checks">
        {hasOpenedChecks ? <InquirySpamChecks id={inquiry.id} /> : null}
      </CollapsibleSection>
      <CollapsibleSection title="Quality">
        <View style={{ gap: spacing.xs }}>
          {factors.map((factor) => (
            <InquiryLine key={factor.label} left={`${factor.met ? "✓" : "–"} ${factor.label}`} muted={!factor.met} />
          ))}
        </View>
      </CollapsibleSection>
    </View>
  );
}
