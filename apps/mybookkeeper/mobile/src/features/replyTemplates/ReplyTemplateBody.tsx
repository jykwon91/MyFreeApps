import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import TransactionFact from "../transactions/TransactionFact";
import { variablesUsed } from "./replyTemplateDisplay";

/** The template's name, words and variables, as both the active and archived screens show them. */
export default function ReplyTemplateBody({ template }: { template: ReplyTemplate }) {
  const { colors, spacing, fontSize } = useTheme();
  const variables = variablesUsed(template);
  const labelStyle = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const textStyle = { fontSize: fontSize.md, color: colors.foreground };

  return (
    <>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
        {template.name}
      </Text>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={labelStyle}>
          {REPLY_TEMPLATE_MESSAGES.subject}
        </Text>
        <Text selectable style={textStyle}>
          {template.subject_template}
        </Text>
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={labelStyle}>
          {REPLY_TEMPLATE_MESSAGES.message}
        </Text>
        <Text selectable style={textStyle}>
          {template.body_template}
        </Text>
      </View>
      {variables.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {REPLY_TEMPLATE_MESSAGES.variablesHeading}
          </Text>
          {variables.map((variable) => (
            <TransactionFact key={variable.token} label={variable.token} value={variable.fillsIn} />
          ))}
        </View>
      ) : null}
    </>
  );
}
