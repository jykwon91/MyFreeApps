import type { InquiryMessage } from "@mybookkeeper/api-client/types/inquiry/inquiry-message";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { arrangeMessages } from "./inquiryDisplay";
import InquiryMessageCard from "./InquiryMessageCard";

export default function InquiryMessages({ messages, name }: { messages: InquiryMessage[]; name: string | null }) {
  const { colors, spacing, fontSize } = useTheme();
  const [showEarlier, setShowEarlier] = useState(false);
  const { first, earlier } = useMemo(() => arrangeMessages(messages), [messages]);

  if (!first) {
    return <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>No messages yet.</Text>;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <InquiryMessageCard message={first} name={name} />
      {earlier.length > 0 ? (
        <LoadingButton onPress={() => setShowEarlier(!showEarlier)} variant="ghost">
          {showEarlier ? "Hide other messages" : earlier.length === 1 ? "Show 1 other message" : `Show ${earlier.length} other messages`}
        </LoadingButton>
      ) : null}
      {showEarlier ? earlier.map((message) => <InquiryMessageCard key={message.id} message={message} name={name} />) : null}
    </View>
  );
}
