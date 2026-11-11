import { SegmentedControl, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES, ANALYZE_SOURCES } from "../../constants/analyze";
import type { AnalyzeInputStepProps } from "../../types/AnalyzeInputStepProps";
import AnalyzeLinkFields from "./AnalyzeLinkFields";
import AnalyzeTextFields from "./AnalyzeTextFields";

/** What the website's input step says, then its two ways in: a link (first, as there) or pasted text. */
export default function AnalyzeInputStep(props: AnalyzeInputStepProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
          {MESSAGES.heading}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.intro}</Text>
      </View>
      <SegmentedControl accessibilityLabel={MESSAGES.sourceLabel} onChange={props.onSourceChange} segments={ANALYZE_SOURCES} value={props.source} />
      {props.source === "url" ? (
        <AnalyzeLinkFields onAnalyze={props.onAnalyzeLink} onChange={props.onUrlChange} onPaste={props.onPasteLink} value={props.urlValue} />
      ) : (
        <AnalyzeTextFields error={props.textError} onAnalyze={props.onAnalyzeText} onChange={props.onTextChange} value={props.textValue} />
      )}
    </>
  );
}
