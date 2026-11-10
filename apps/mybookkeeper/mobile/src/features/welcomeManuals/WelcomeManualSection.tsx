import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { previewFields } from "@mybookkeeper/api-client/utils/welcomeManualPreview";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { plainFromMarkdown } from "../../lib/plainFromMarkdown";
import TransactionFact from "../transactions/TransactionFact";
import WelcomeManualPhoto from "./WelcomeManualPhoto";

/** One section as a guest reads it: its text, its label and value pairs and its photos. */
export default function WelcomeManualSection({ section }: { section: WelcomeManualSectionResponse }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {section.title}
      </Text>
      {section.body ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {plainFromMarkdown(section.body)}
        </Text>
      ) : null}
      {previewFields(section.fields).map((field) => (
        <TransactionFact key={field.id} label={field.label} selectable value={field.value ?? ""} />
      ))}
      {section.images.map((image) => (
        <WelcomeManualPhoto image={image} key={image.id} size="full" />
      ))}
    </View>
  );
}
