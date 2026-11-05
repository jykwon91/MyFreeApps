import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { plainFromMarkdown } from "../../lib/plainFromMarkdown";
import InquiryChip from "../inquiries/InquiryChip";
import TransactionFact from "../transactions/TransactionFact";
import { photosLine } from "./welcomeManualDisplay";

interface WelcomeManualSectionProps {
  section: WelcomeManualSectionResponse;
  roomName: string | null;
}

export default function WelcomeManualSection({ section, roomName }: WelcomeManualSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const photos = photosLine(section.images.length);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {section.title}
      </Text>
      {roomName ? <InquiryChip label={roomName} /> : null}
      {section.fields.map((field) =>
        field.value ? <TransactionFact key={field.id} label={field.label} selectable value={field.value} /> : null,
      )}
      {section.body ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {plainFromMarkdown(section.body)}
        </Text>
      ) : null}
      {photos ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{photos}</Text> : null}
    </View>
  );
}
